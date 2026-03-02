from uuid import UUID

import pytest

from app.models import Tool, ToolEmbedding, Feature, HttpMethod
from app.services import embedding_service
from app.services.embedding_service import _compute_hash, _tool_to_text, generate_embedding, upsert_tool_embedding, delete_tool_embedding, search_similar_tools


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
    def __init__(self, scalar_results=None, scalars_result=None, capture_query=False):
        self.scalar_results = scalar_results or []
        self.scalars_result = scalars_result or []
        self.added = []
        self.deleted = []
        self.flushed = False
        self.capture_query = capture_query
        self.last_query = None

    def scalar(self, _query):
        if self.scalar_results:
            return self.scalar_results.pop(0)
        return None

    def scalars(self, _query):
        if self.capture_query:
            self.last_query = _query
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


def test_tool_to_text_includes_parts():
    feature = Feature(id=UUID(int=201), user_id="u", name="Users")
    tool_record = Tool(id=UUID(int=1), user_id="u", path="/p", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}}, agent_enabled=True, feature_id=feature.id, feature=feature)
    text = _tool_to_text(tool_record)
    assert "GET" in text and "/p" in text and "n" in text and "Users" in text


def test_generate_embedding_uses_client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(embedding_service, "_get_openai_client", lambda: FakeClient())
    vector = generate_embedding("text")
    assert vector == [0.1, 0.2]


def test_upsert_tool_embedding_creates_and_updates(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: [0.5])
    tool_id = UUID(int=2)
    feature = Feature(id=UUID(int=102), user_id="u", name="Feature A")
    tool_record = Tool(id=tool_id, user_id="u", path="/p", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}}, agent_enabled=True, feature_id=feature.id, feature=feature)
    session = FakeSession(scalar_results=[tool_record, None])
    created = upsert_tool_embedding(session, tool_id, "u")
    assert isinstance(created, ToolEmbedding)
    assert session.added and session.flushed

    updated_feature = Feature(id=UUID(int=103), user_id="u", name="Feature B")
    updated_tool = Tool(id=tool_id, user_id="u", path="/p2", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}}, agent_enabled=True, feature_id=updated_feature.id, feature=updated_feature)
    existing = ToolEmbedding(tool_id=tool_id, user_id="u", embedding=[0.1], content_hash=_compute_hash(_tool_to_text(tool_record)))
    session2 = FakeSession(scalar_results=[updated_tool, existing])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: [0.9])
    updated = upsert_tool_embedding(session2, tool_id, "u")
    assert updated is existing
    assert existing.embedding == [0.9]


def test_upsert_tool_embedding_returns_none_on_error(monkeypatch: pytest.MonkeyPatch):
    tool_id = UUID(int=3)
    feature = Feature(id=UUID(int=203), user_id="u", name="Feature C")
    tool_record = Tool(id=tool_id, user_id="u", path="/p", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}}, agent_enabled=True, feature_id=feature.id, feature=feature)
    session = FakeSession(scalar_results=[tool_record, None])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: (_ for _ in ()).throw(RuntimeError("fail")))
    assert upsert_tool_embedding(session, tool_id, "u") is None


def test_upsert_tool_embedding_returns_existing_when_unchanged(monkeypatch: pytest.MonkeyPatch):
    tool_id = UUID(int=8)
    feature = Feature(id=UUID(int=208), user_id="u", name="Feature E")
    tool_record = Tool(id=tool_id, user_id="u", path="/p", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}}, agent_enabled=True, feature_id=feature.id, feature=feature)
    existing = ToolEmbedding(tool_id=tool_id, user_id="u", embedding=[0.1], content_hash=_compute_hash(_tool_to_text(tool_record)))
    session = FakeSession(scalar_results=[tool_record, existing])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: [0.2])
    result = upsert_tool_embedding(session, tool_id, "u")
    assert result is existing


def test_fake_session_scalar_defaults_to_none():
    session = FakeSession()
    assert session.scalar(None) is None


def test_delete_tool_embedding_removes(monkeypatch: pytest.MonkeyPatch):
    existing = ToolEmbedding(tool_id=UUID(int=4), user_id="u", embedding=[0.1], content_hash="h")
    session = FakeSession(scalar_results=[existing])
    delete_tool_embedding(session, existing.tool_id)
    assert existing in session.deleted


def test_search_similar_tools_handles_zero_and_errors(monkeypatch: pytest.MonkeyPatch):
    session = FakeSession(scalar_results=[0])
    assert search_similar_tools(session, "u", "q") == []

    session2 = FakeSession(scalar_results=[1], scalars_result=[UUID(int=5)])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda q: (_ for _ in ()).throw(RuntimeError("fail")))
    assert search_similar_tools(session2, "u", "q") == []


def test_upsert_tool_embedding_missing_tool_logs(monkeypatch: pytest.MonkeyPatch):
    session = FakeSession(scalar_results=[None])
    assert upsert_tool_embedding(session, UUID(int=6), "u") is None


def test_search_similar_tools_success(monkeypatch: pytest.MonkeyPatch):
    session = FakeSession(scalar_results=[1], scalars_result=[UUID(int=7)])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda q: [0.1])
    result = search_similar_tools(session, "u", "q", top_k=1)
    assert result == [UUID(int=7)]


def test_upsert_tool_embedding_skips_disabled(monkeypatch: pytest.MonkeyPatch):
    tool_id = UUID(int=9)
    feature = Feature(id=UUID(int=209), user_id="u", name="Feature F")
    tool_record = Tool(id=tool_id, user_id="u", path="/p", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}}, agent_enabled=False, feature_id=feature.id, feature=feature)
    existing = ToolEmbedding(tool_id=tool_id, user_id="u", embedding=[0.1], content_hash="hash")
    session = FakeSession(scalar_results=[tool_record, existing])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: [0.5])
    result = upsert_tool_embedding(session, tool_id, "u")
    assert result is None
    assert existing in session.deleted


def test_upsert_tool_embedding_updates_when_feature_changes(monkeypatch: pytest.MonkeyPatch):
    tool_id = UUID(int=10)
    old_feature = Feature(id=UUID(int=210), user_id="u", name="Old")
    new_feature = Feature(id=UUID(int=211), user_id="u", name="New")
    original_tool = Tool(id=tool_id, user_id="u", path="/same", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}}, agent_enabled=True, feature_id=old_feature.id, feature=old_feature)
    existing = ToolEmbedding(tool_id=tool_id, user_id="u", embedding=[0.1], content_hash=_compute_hash(_tool_to_text(original_tool)))
    updated_tool = Tool(id=tool_id, user_id="u", path="/same", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}}, agent_enabled=True, feature_id=new_feature.id, feature=new_feature)
    session = FakeSession(scalar_results=[updated_tool, existing])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: [0.7])
    result = upsert_tool_embedding(session, tool_id, "u")
    assert result is existing
    assert existing.embedding == [0.7]
    assert session.flushed


def test_upsert_tool_embedding_rejects_user_mismatch(monkeypatch: pytest.MonkeyPatch):
    tool_id = UUID(int=12)
    feature = Feature(id=UUID(int=212), user_id="owner", name="Feature G")
    tool_record = Tool(id=tool_id, user_id="owner", path="/p", method=HttpMethod.get, tool={"function": {"name": "n", "description": "d", "parameters": {}}}, agent_enabled=True, feature_id=feature.id, feature=feature)
    session = FakeSession(scalar_results=[tool_record, None])
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda text: (_ for _ in ()).throw(RuntimeError("should not run")))
    result = upsert_tool_embedding(session, tool_id, "other")
    assert result is None
    assert session.added == []
    assert session.flushed is False


def test_search_similar_tools_filters_by_tool_owner(monkeypatch: pytest.MonkeyPatch):
    session = FakeSession(scalars_result=[UUID(int=13)], capture_query=True)
    monkeypatch.setattr(embedding_service, "generate_embedding", lambda q: [0.1])
    result = search_similar_tools(session, "user-x", "query", top_k=1)
    assert result == [UUID(int=13)]
    sql = str(session.last_query).lower()
    assert "halfvec" in sql
    assert "tools.user_id" in sql
    assert "tool_embeddings.user_id" not in sql
