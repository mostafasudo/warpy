from uuid import UUID

import pytest

from app.models import KnowledgeChunk, KnowledgeEmbedding
from app.services import knowledge_embedding_service
from app.services.embedding_service import _compute_hash


class FakeSession:
    def __init__(self, scalar_results=None, execute_results=None, capture_query=False, dialect_name: str | None = None):
        self.scalar_results = scalar_results or []
        self.added = []
        self.flushed = False
        self.capture_query = capture_query
        self.last_query = None
        self.bind = type("Bind", (), {"dialect": type("Dialect", (), {"name": dialect_name})()})() if dialect_name else None

    def scalar(self, _query):
        if self.scalar_results:
            return self.scalar_results.pop(0)
        return None

    def execute(self, _query):
        if self.capture_query:
            self.last_query = _query
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
    def __init__(self, scalar_results=None, execute_results=None, capture_query=False, dialect_name: str | None = None):
        super().__init__(scalar_results, capture_query=capture_query, dialect_name=dialect_name)
        self._execute_results = execute_results or []

    def execute(self, _query):
        if self.capture_query:
            self.last_query = _query
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
    chunk_id = UUID(int=10)
    session = FakeSessionWithExecute(scalar_results=[10])
    monkeypatch.setattr(knowledge_embedding_service, "_build_query_variants", lambda query: [query])
    monkeypatch.setattr(knowledge_embedding_service, "_is_postgresql_session", lambda session: False)
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunks_lexically", lambda *args, **kwargs: [chunk_id])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunk_fields", lambda *args, **kwargs: [])
    monkeypatch.setattr(knowledge_embedding_service, "_model_rerank_candidates", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_embedding_service,
        "_fetch_retrieved_chunks",
        lambda session, chunk_ids: {
            chunk_id: knowledge_embedding_service.RetrievedChunk(
                chunk_id=chunk_id,
                document_id=UUID(int=11),
                content="doc content",
                chunk_metadata={"page_numbers": [1]},
                section_title="Pricing",
                title="Popcorn Pricing",
                source_url="https://trypopcorn.ai/",
                source_kind="website_page",
                source_hash="hash-1",
                content_language="english",
                chunk_index=0,
            )
        },
    )
    result = knowledge_embedding_service.search_knowledge_base(session, "u", "query")
    assert len(result) == 1
    assert result[0]["snippet"] == "doc content"
    assert result[0]["title"] == "Popcorn Pricing"
    assert result[0]["sectionTitle"] == "Pricing"
    assert result[0]["sourceKind"] == "website"


def test_search_with_explicit_top_k(monkeypatch):
    session = FakeSessionWithExecute(scalar_results=[], execute_results=[])
    monkeypatch.setattr(knowledge_embedding_service, "_build_query_variants", lambda query: [query])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunks_lexically", lambda *args, **kwargs: [])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunk_fields", lambda *args, **kwargs: [])
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
    chunk_id = UUID(int=12)
    session = FakeSessionWithExecute(scalar_results=[10])
    monkeypatch.setattr(knowledge_embedding_service, "_build_query_variants", lambda query: [query])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunks_lexically", lambda *args, **kwargs: [chunk_id])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunk_fields", lambda *args, **kwargs: [])
    monkeypatch.setattr(knowledge_embedding_service, "_model_rerank_candidates", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_embedding_service,
        "_fetch_retrieved_chunks",
        lambda session, chunk_ids: {
            chunk_id: knowledge_embedding_service.RetrievedChunk(
                chunk_id=chunk_id,
                document_id=UUID(int=13),
                content="text",
                chunk_metadata={"element_types": ["NarrativeText"], "page_numbers": [1], "filename": "leak.pdf"},
                section_title="Overview",
                title="Guide",
                source_url=None,
                source_kind="file",
                source_hash=None,
                content_language="english",
                chunk_index=0,
            )
        },
    )
    result = knowledge_embedding_service.search_knowledge_base(session, "u", "query")
    assert len(result) == 1
    assert "filename" not in result[0]
    assert result[0]["elementTypes"] == ["NarrativeText"]
    assert result[0]["pageNumbers"] == [1]


def test_search_uses_halfvec_distance(monkeypatch):
    session = FakeSessionWithExecute(execute_results=[], capture_query=True, dialect_name="postgresql")
    result = knowledge_embedding_service._search_embedded_chunks_exact(session, "u", [0.1], 1)
    assert result == []
    sql = str(session.last_query).lower()
    assert "halfvec" in sql


def test_search_prefers_pricing_sections_for_pricing_queries(monkeypatch):
    pricing_id = UUID(int=20)
    legal_id = UUID(int=21)
    session = FakeSessionWithExecute(scalar_results=[10])
    monkeypatch.setattr(knowledge_embedding_service, "_build_query_variants", lambda query: [query])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunks_lexically", lambda *args, **kwargs: [legal_id, pricing_id])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunk_fields", lambda *args, **kwargs: [pricing_id])
    monkeypatch.setattr(knowledge_embedding_service, "_model_rerank_candidates", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_embedding_service,
        "_fetch_retrieved_chunks",
        lambda session, chunk_ids: {
            pricing_id: knowledge_embedding_service.RetrievedChunk(
                chunk_id=pricing_id,
                document_id=UUID(int=22),
                content="$139 per month 2,000 credits/month",
                chunk_metadata={},
                section_title="Simple, Transparent Pricing",
                title="Popcorn Pricing",
                source_url="https://trypopcorn.ai/",
                source_kind="website_page",
                source_hash="pricing",
                content_language="english",
                chunk_index=0,
            ),
            legal_id: knowledge_embedding_service.RetrievedChunk(
                chunk_id=legal_id,
                document_id=UUID(int=23),
                content="Subscriptions renew automatically unless cancelled.",
                chunk_metadata={},
                section_title="Terms of Service",
                title="Terms of Service",
                source_url="https://trypopcorn.ai/terms-of-service",
                source_kind="website_page",
                source_hash="legal",
                content_language="english",
                chunk_index=0,
            ),
        },
    )

    result = knowledge_embedding_service.search_knowledge_base(session, "u", "trypopcorn.ai pricing plans")
    assert result[0]["sectionTitle"] == "Simple, Transparent Pricing"


def test_search_prefers_policy_sections_for_policy_queries(monkeypatch):
    pricing_id = UUID(int=30)
    legal_id = UUID(int=31)
    session = FakeSessionWithExecute(scalar_results=[10])
    monkeypatch.setattr(knowledge_embedding_service, "_build_query_variants", lambda query: [query])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunks_lexically", lambda *args, **kwargs: [pricing_id, legal_id])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunk_fields", lambda *args, **kwargs: [legal_id])
    monkeypatch.setattr(knowledge_embedding_service, "_model_rerank_candidates", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_embedding_service,
        "_fetch_retrieved_chunks",
        lambda session, chunk_ids: {
            pricing_id: knowledge_embedding_service.RetrievedChunk(
                chunk_id=pricing_id,
                document_id=UUID(int=32),
                content="$139 per month",
                chunk_metadata={},
                section_title="Simple, Transparent Pricing",
                title="Popcorn Pricing",
                source_url="https://trypopcorn.ai/",
                source_kind="website_page",
                source_hash="pricing",
                content_language="english",
                chunk_index=0,
            ),
            legal_id: knowledge_embedding_service.RetrievedChunk(
                chunk_id=legal_id,
                document_id=UUID(int=33),
                content="You may cancel your subscription at any time.",
                chunk_metadata={},
                section_title="Cancellation and Refunds",
                title="Terms of Service",
                source_url="https://trypopcorn.ai/terms-of-service",
                source_kind="website_page",
                source_hash="legal",
                content_language="english",
                chunk_index=0,
            ),
        },
    )

    result = knowledge_embedding_service.search_knowledge_base(session, "u", "what is their cancellation policy")
    assert result[0]["sectionTitle"] == "Cancellation and Refunds"


def test_search_dedupes_duplicate_website_pages(monkeypatch):
    first_id = UUID(int=40)
    duplicate_id = UUID(int=41)
    session = FakeSessionWithExecute(scalar_results=[10])
    monkeypatch.setattr(knowledge_embedding_service, "_build_query_variants", lambda query: [query])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunks_lexically", lambda *args, **kwargs: [first_id, duplicate_id])
    monkeypatch.setattr(knowledge_embedding_service, "_search_chunk_fields", lambda *args, **kwargs: [])
    monkeypatch.setattr(knowledge_embedding_service, "_model_rerank_candidates", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_embedding_service,
        "_fetch_retrieved_chunks",
        lambda session, chunk_ids: {
            first_id: knowledge_embedding_service.RetrievedChunk(
                chunk_id=first_id,
                document_id=UUID(int=42),
                content="Pricing info",
                chunk_metadata={},
                section_title="Pricing",
                title="Popcorn Pricing",
                source_url="https://trypopcorn.ai/",
                source_kind="website_page",
                source_hash="same-page",
                content_language="english",
                chunk_index=0,
            ),
            duplicate_id: knowledge_embedding_service.RetrievedChunk(
                chunk_id=duplicate_id,
                document_id=UUID(int=43),
                content="Pricing info duplicate",
                chunk_metadata={},
                section_title="Pricing",
                title="Popcorn Pricing Mirror",
                source_url="https://trypopcorn.ai/?r=0",
                source_kind="website_page",
                source_hash="same-page",
                content_language="english",
                chunk_index=0,
            ),
        },
    )

    result = knowledge_embedding_service.search_knowledge_base(session, "u", "pricing")
    assert len(result) == 1
