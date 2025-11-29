from uuid import UUID

import pytest

from app.models import Endpoint, EndpointEmbedding, HttpMethod
from app.services import embedding_service
from app.services.embedding_service import _compute_hash, _endpoint_to_text, generate_embedding, upsert_endpoint_embedding, delete_endpoint_embedding, search_similar_endpoints


class FakeClient:
    class Embeddings:
        @staticmethod
        def create(model, input, dimensions):
            class Data:
                def __init__(self):
                    self.embedding = [0.1, 0.2]
            class Item:
                def __init__(self):
                    self.data = [Data()]
            return Item()
    def __init__(self):
        self.embeddings = self.Embeddings()


class FakeSession:
    def __init__(self, scalar_results=None, scalars_result=None):
        self.scalar_results = scalar_results or []
        self.scalars_result = scalars_result or []
        self.added = []
        self.deleted = []
        self.flushed = False

    def scalar(self, _query):
        if self.scalar_results:
            return self.scalar_results.pop(0)
        return None

    def scalars(self, _query):
        class Result:
            def __init__(self, rows):
                self._rows = rows
            def all(self):
                return self._rows
        return Result(self.scalars_result)

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        self.flushed = True

    def delete(self, obj):
        self.deleted.append(obj)


def test_compute_hash_changes_with_text():
    assert _compute_hash("a") != _compute_hash("b")


def test_endpoint_to_text_includes_parts():
    endpoint = Endpoint(id=UUID(int=1), user_id="u", path="/p", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}})
    text = _endpoint_to_text(endpoint)
    assert "GET" in text and "/p" in text and "n" in text


def test_generate_embedding_uses_client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(embedding_service, "_get_openai_client", lambda: FakeClient())
    vector = generate_embedding("text")
    assert vector == [0.1, 0.2]


def test_upsert_endpoint_embedding_creates_and_updates(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: [0.5])
    endpoint_id = UUID(int=2)
    endpoint = Endpoint(id=endpoint_id, user_id="u", path="/p", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}})
    session = FakeSession(scalar_results=[endpoint, None])
    created = upsert_endpoint_embedding(session, endpoint_id, "u")
    assert isinstance(created, EndpointEmbedding)
    assert session.added and session.flushed

    updated_endpoint = Endpoint(id=endpoint_id, user_id="u", path="/p2", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}})
    existing = EndpointEmbedding(endpoint_id=endpoint_id, user_id="u", embedding=[0.1], content_hash=_compute_hash(_endpoint_to_text(endpoint)))
    session2 = FakeSession(scalar_results=[updated_endpoint, existing])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: [0.9])
    updated = upsert_endpoint_embedding(session2, endpoint_id, "u")
    assert updated is existing
    assert existing.embedding == [0.9]


def test_upsert_endpoint_embedding_returns_none_on_error(monkeypatch: pytest.MonkeyPatch):
    endpoint_id = UUID(int=3)
    endpoint = Endpoint(id=endpoint_id, user_id="u", path="/p", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}})
    session = FakeSession(scalar_results=[endpoint, None])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: (_ for _ in ()).throw(RuntimeError("fail")))
    assert upsert_endpoint_embedding(session, endpoint_id, "u") is None


def test_upsert_endpoint_embedding_returns_existing_when_unchanged(monkeypatch: pytest.MonkeyPatch):
    endpoint_id = UUID(int=8)
    endpoint = Endpoint(id=endpoint_id, user_id="u", path="/p", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}})
    existing = EndpointEmbedding(endpoint_id=endpoint_id, user_id="u", embedding=[0.1], content_hash=_compute_hash(_endpoint_to_text(endpoint)))
    session = FakeSession(scalar_results=[endpoint, existing])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: [0.2])
    result = upsert_endpoint_embedding(session, endpoint_id, "u")
    assert result is existing


def test_fake_session_scalar_defaults_to_none():
    session = FakeSession()
    assert session.scalar(None) is None


def test_delete_endpoint_embedding_removes(monkeypatch: pytest.MonkeyPatch):
    existing = EndpointEmbedding(endpoint_id=UUID(int=4), user_id="u", embedding=[0.1], content_hash="h")
    session = FakeSession(scalar_results=[existing])
    delete_endpoint_embedding(session, existing.endpoint_id)
    assert existing in session.deleted


def test_search_similar_endpoints_handles_zero_and_errors(monkeypatch: pytest.MonkeyPatch):
    session = FakeSession(scalar_results=[0])
    assert search_similar_endpoints(session, "u", "q") == []

    session2 = FakeSession(scalar_results=[1], scalars_result=[UUID(int=5)])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda q: (_ for _ in ()).throw(RuntimeError("fail")))
    assert search_similar_endpoints(session2, "u", "q") == []


def test_upsert_endpoint_embedding_missing_endpoint_logs(monkeypatch: pytest.MonkeyPatch):
    session = FakeSession(scalar_results=[None])
    assert upsert_endpoint_embedding(session, UUID(int=6), "u") is None


def test_search_similar_endpoints_success(monkeypatch: pytest.MonkeyPatch):
    session = FakeSession(scalar_results=[1], scalars_result=[UUID(int=7)])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda q: [0.1])
    result = search_similar_endpoints(session, "u", "q", top_k=1)
    assert result == [UUID(int=7)]
