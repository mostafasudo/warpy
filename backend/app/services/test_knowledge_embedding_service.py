from uuid import UUID

import pytest

from app.models import KnowledgeChunk, KnowledgeEmbedding
from app.services import knowledge_embedding_service
from app.services.embedding_service import _compute_hash


class FakeSession:
    def __init__(self, scalar_results=None, execute_results=None):
        self.scalar_results = scalar_results or []
        self.added = []
        self.flushed = False

    def scalar(self, _query):
        if self.scalar_results:
            return self.scalar_results.pop(0)
        return None

    def execute(self, _query):
        class Result:
            def __init__(self, rows):
                self._rows = rows
            def all(self):
                return self._rows
        return Result(self.execute_results if hasattr(self, '_execute_results') else [])

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        self.flushed = True


class FakeSessionWithExecute(FakeSession):
    def __init__(self, scalar_results=None, execute_results=None):
        super().__init__(scalar_results)
        self._execute_results = execute_results or []

    def execute(self, _query):
        class Result:
            def __init__(self, rows):
                self._rows = rows
            def all(self):
                return self._rows
        return Result(self._execute_results)


def test_upsert_creates_new_embedding(monkeypatch):
    chunk_id = UUID(int=1)
    chunk = KnowledgeChunk(id=chunk_id, user_id="u", content="hello", chunk_index=0)
    session = FakeSession(scalar_results=[chunk, None])
    monkeypatch.setattr(knowledge_embedding_service, "generate_embedding", lambda text: [0.5, 0.6])
    result = knowledge_embedding_service.upsert_knowledge_embedding(session, chunk_id, "u")
    assert isinstance(result, KnowledgeEmbedding)
    assert session.added and session.flushed


def test_upsert_returns_existing_when_unchanged(monkeypatch):
    chunk_id = UUID(int=2)
    chunk = KnowledgeChunk(id=chunk_id, user_id="u", content="hello", chunk_index=0)
    existing = KnowledgeEmbedding(chunk_id=chunk_id, user_id="u", embedding=[0.1], content_hash=_compute_hash("hello"))
    session = FakeSession(scalar_results=[chunk, existing])
    result = knowledge_embedding_service.upsert_knowledge_embedding(session, chunk_id, "u")
    assert result is existing
    assert not session.flushed


def test_upsert_updates_when_hash_changed(monkeypatch):
    chunk_id = UUID(int=3)
    chunk = KnowledgeChunk(id=chunk_id, user_id="u", content="updated", chunk_index=0)
    existing = KnowledgeEmbedding(chunk_id=chunk_id, user_id="u", embedding=[0.1], content_hash=_compute_hash("old"))
    session = FakeSession(scalar_results=[chunk, existing])
    monkeypatch.setattr(knowledge_embedding_service, "generate_embedding", lambda text: [0.9])
    result = knowledge_embedding_service.upsert_knowledge_embedding(session, chunk_id, "u")
    assert result is existing
    assert existing.embedding == [0.9]
    assert session.flushed


def test_upsert_returns_none_for_missing_chunk():
    session = FakeSession(scalar_results=[None])
    result = knowledge_embedding_service.upsert_knowledge_embedding(session, UUID(int=4), "u")
    assert result is None


def test_upsert_returns_none_for_user_mismatch():
    chunk_id = UUID(int=5)
    chunk = KnowledgeChunk(id=chunk_id, user_id="owner", content="hello", chunk_index=0)
    session = FakeSession(scalar_results=[chunk])
    result = knowledge_embedding_service.upsert_knowledge_embedding(session, chunk_id, "other")
    assert result is None


def test_upsert_returns_none_on_embedding_error(monkeypatch):
    chunk_id = UUID(int=6)
    chunk = KnowledgeChunk(id=chunk_id, user_id="u", content="hello", chunk_index=0)
    session = FakeSession(scalar_results=[chunk, None])
    monkeypatch.setattr(knowledge_embedding_service, "generate_embedding", lambda text: (_ for _ in ()).throw(RuntimeError("fail")))
    result = knowledge_embedding_service.upsert_knowledge_embedding(session, chunk_id, "u")
    assert result is None


def test_search_returns_empty_for_zero_chunks(monkeypatch):
    session = FakeSession(scalar_results=[0])
    result = knowledge_embedding_service.search_knowledge_base(session, "u", "query")
    assert result == []


def test_search_returns_empty_on_embedding_error(monkeypatch):
    session = FakeSession(scalar_results=[5])
    monkeypatch.setattr(knowledge_embedding_service, "generate_embedding", lambda text: (_ for _ in ()).throw(RuntimeError("fail")))
    result = knowledge_embedding_service.search_knowledge_base(session, "u", "query")
    assert result == []


def test_search_returns_results(monkeypatch):
    class Row:
        def __init__(self, content, chunk_metadata):
            self.content = content
            self.chunk_metadata = chunk_metadata

    session = FakeSessionWithExecute(
        scalar_results=[10],
        execute_results=[Row("doc content", {"page_numbers": [1]})]
    )
    monkeypatch.setattr(knowledge_embedding_service, "generate_embedding", lambda text: [0.1])
    result = knowledge_embedding_service.search_knowledge_base(session, "u", "query")
    assert len(result) == 1
    assert result[0]["content"] == "doc content"


def test_search_with_explicit_top_k(monkeypatch):
    session = FakeSessionWithExecute(scalar_results=[], execute_results=[])
    monkeypatch.setattr(knowledge_embedding_service, "generate_embedding", lambda text: [0.1])
    result = knowledge_embedding_service.search_knowledge_base(session, "u", "query", top_k=5)
    assert result == []


def test_search_returns_empty_when_top_k_zero(monkeypatch):
    result = knowledge_embedding_service.search_knowledge_base(FakeSession(scalar_results=[0]), "u", "query")
    assert result == []


def test_sanitize_metadata_whitelists_keys():
    from app.services.knowledge_embedding_service import _sanitize_metadata
    meta = {"element_types": ["Title"], "page_numbers": [1], "filename": "secret.pdf", "url": "https://internal"}
    clean = _sanitize_metadata(meta)
    assert "element_types" in clean
    assert "page_numbers" in clean
    assert "filename" not in clean
    assert "url" not in clean


def test_sanitize_metadata_handles_none():
    from app.services.knowledge_embedding_service import _sanitize_metadata
    assert _sanitize_metadata(None) == {}
    assert _sanitize_metadata({}) == {}


def test_search_results_have_sanitized_metadata(monkeypatch):
    class Row:
        def __init__(self, content, chunk_metadata):
            self.content = content
            self.chunk_metadata = chunk_metadata

    session = FakeSessionWithExecute(
        scalar_results=[10],
        execute_results=[Row("text", {"element_types": ["NarrativeText"], "page_numbers": [1], "filename": "leak.pdf"})]
    )
    monkeypatch.setattr(knowledge_embedding_service, "generate_embedding", lambda text: [0.1])
    result = knowledge_embedding_service.search_knowledge_base(session, "u", "query")
    assert len(result) == 1
    assert "filename" not in result[0]["metadata"]
    assert result[0]["metadata"]["element_types"] == ["NarrativeText"]
