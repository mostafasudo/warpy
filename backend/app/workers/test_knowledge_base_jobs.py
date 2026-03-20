from uuid import UUID

import pytest
from types import SimpleNamespace

from app.workers import knowledge_base_jobs
from app.workers.knowledge_base_jobs import (
    _sanitize_error,
    enqueue_document_processing,
    ensure_knowledge_base_retrieval_backfill,
    enqueue_website_processing,
    process_knowledge_base_retrieval_backfill,
    process_document,
    process_website,
    process_website_refresh_sweep,
)


class FakeQueue:
    def __init__(self):
        self.calls = []
        self.connection = object()

    def enqueue(self, func, *args, **kwargs):
        self.calls.append((func, args, kwargs))


def test_enqueue_document_processing(monkeypatch):
    queue = FakeQueue()
    monkeypatch.setattr(knowledge_base_jobs, "get_queue", lambda name="default": queue)
    enqueue_document_processing(UUID(int=1), "user", b"data", "test.pdf")
    assert queue.calls
    func, args, kwargs = queue.calls[0]
    assert func is process_document
    assert args == (str(UUID(int=1)), "user", b"data", "test.pdf")
    assert kwargs.get("retry") is knowledge_base_jobs.retry_policy
    assert kwargs.get("job_timeout") == 600


def test_enqueue_website_processing(monkeypatch):
    queue = FakeQueue()
    monkeypatch.setattr(knowledge_base_jobs, "get_queue", lambda name="default": queue)
    monkeypatch.setattr(knowledge_base_jobs, "ensure_website_refresh_sweep", lambda: None)
    monkeypatch.setattr(knowledge_base_jobs, "_fetch_job", lambda job_id: None)
    enqueue_website_processing(UUID(int=7), "user")
    assert queue.calls
    func, args, kwargs = queue.calls[0]
    assert func is process_website
    assert args == (str(UUID(int=7)), "user")
    assert kwargs.get("job_id") == "knowledge-base-website-00000000-0000-0000-0000-000000000007"
    assert kwargs.get("retry") is knowledge_base_jobs.website_retry_policy
    assert kwargs.get("job_timeout") == knowledge_base_jobs.WEBSITE_JOB_TIMEOUT


def test_enqueue_website_processing_marks_retry_due_when_enqueue_fails(monkeypatch):
    class FailingQueue:
        def enqueue(self, *args, **kwargs):
            raise RuntimeError("fail")

    state_updates = []
    session = TrackingSession()
    ctx = FakeContext(session)

    monkeypatch.setattr(knowledge_base_jobs, "get_queue", lambda name="default": FailingQueue())
    monkeypatch.setattr(knowledge_base_jobs, "ensure_website_refresh_sweep", lambda: None)
    monkeypatch.setattr(knowledge_base_jobs, "session_scope", lambda: ctx)
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "update_website_state",
        lambda session, wid, user_id, status, **kwargs: state_updates.append((status, kwargs)),
    )

    enqueue_website_processing(UUID(int=7), "user")

    assert state_updates
    status, kwargs = state_updates[0]
    assert status == knowledge_base_jobs.WebsiteStatus.error
    assert kwargs["error_message"] == "Failed to queue this website. Please try again."
    assert kwargs["next_refresh_at"] is not None


def test_enqueue_website_processing_coalesces_when_enqueue_lock_is_busy(monkeypatch):
    queue = FakeQueue()

    class BusyLock:
        def acquire(self):
            return False

    class LockingConnection:
        def lock(self, *args, **kwargs):
            return BusyLock()

    queue.connection = LockingConnection()
    monkeypatch.setattr(knowledge_base_jobs, "get_queue", lambda name="default": queue)
    monkeypatch.setattr(knowledge_base_jobs, "ensure_website_refresh_sweep", lambda: None)
    monkeypatch.setattr(knowledge_base_jobs, "log_info", lambda *args, **kwargs: None)

    enqueue_website_processing(UUID(int=7), "user")

    assert queue.calls == []


def test_ensure_knowledge_base_retrieval_backfill_enqueues_when_needed(monkeypatch):
    queue = FakeQueue()
    monkeypatch.setattr(knowledge_base_jobs, "get_queue", lambda name="default": queue)
    monkeypatch.setattr(knowledge_base_jobs, "_fetch_job", lambda job_id: None)
    monkeypatch.setattr(knowledge_base_jobs, "_has_file_documents_needing_backfill", lambda session: True)
    monkeypatch.setattr(knowledge_base_jobs, "_has_website_sources_needing_backfill", lambda session: False)
    monkeypatch.setattr(knowledge_base_jobs, "session_scope", lambda: FakeContext(object()))

    ensure_knowledge_base_retrieval_backfill()

    assert queue.calls
    func, args, kwargs = queue.calls[0]
    assert func is process_knowledge_base_retrieval_backfill
    assert kwargs["job_id"] == knowledge_base_jobs.KB_RETRIEVAL_BACKFILL_JOB_ID


def test_enqueue_handles_failure(monkeypatch):
    class FailingQueue:
        def enqueue(self, *args, **kwargs):
            raise RuntimeError("fail")

    errors = []
    statuses = []
    session = TrackingSession()
    ctx = FakeContext(session)
    monkeypatch.setattr(knowledge_base_jobs, "get_queue", lambda name="default": FailingQueue())
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: errors.append(kwargs))
    monkeypatch.setattr(knowledge_base_jobs, "session_scope", lambda: ctx)
    monkeypatch.setattr(knowledge_base_jobs, "update_document_status", lambda s, did, st, chunk_count=None, error_message=None: statuses.append(st))
    enqueue_document_processing(UUID(int=2), "user", b"data", "test.pdf")
    assert errors
    assert statuses
    assert statuses[0] == knowledge_base_jobs.DocumentStatus.error


class FakeContext:
    def __init__(self, session):
        self.session = session
        self.entered = False
        self.exited = False

    def __enter__(self):
        self.entered = True
        return self.session

    def __exit__(self, exc_type, exc, tb):
        self.exited = True


class TrackingSession:
    def __init__(self):
        self.added = []
        self.flushed_count = 0

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        self.flushed_count += 1

    def get(self, model, pk):
        for a in self.added:
            if hasattr(a, 'id') and a.id == pk:
                return a
        return None


class ChunkLookupSession:
    def __init__(self, chunks):
        self.chunks = chunks

    def scalars(self, _query):
        class Result:
            def __init__(self, rows):
                self._rows = rows

            def all(self):
                return self._rows

        return Result(self.chunks)


def test_process_document_success(monkeypatch):
    elements = [{"type": "NarrativeText", "text": "content", "metadata": {}}]
    chunks = [{"content": "content", "metadata": {}}]
    session = TrackingSession()
    ctx = FakeContext(session)

    monkeypatch.setattr(knowledge_base_jobs, "parse_document", lambda fb, fn: elements)
    monkeypatch.setattr(knowledge_base_jobs, "chunk_elements", lambda e: chunks)
    monkeypatch.setattr(knowledge_base_jobs, "upsert_knowledge_embedding", lambda s, cid, uid: True)
    monkeypatch.setattr(knowledge_base_jobs, "update_document_status", lambda s, did, st, chunk_count=None, error_message=None: None)
    monkeypatch.setattr(knowledge_base_jobs, "session_scope", lambda: ctx)
    monkeypatch.setattr(knowledge_base_jobs, "log_info", lambda *args, **kwargs: None)

    process_document(str(UUID(int=1)), "user", b"data", "test.pdf")
    assert ctx.entered and ctx.exited
    assert len(session.added) == 1


def test_process_knowledge_base_retrieval_backfill_updates_docs_and_enqueues_websites(monkeypatch):
    document = SimpleNamespace(
        id=UUID(int=60),
        user_id="user",
        file_name="Pricing Guide",
        source_url=None,
        content_language=None,
    )
    chunk = SimpleNamespace(
        id=UUID(int=61),
        content="Pricing is $139 per month",
        section_title="Pricing",
        search_text=None,
    )
    session = ChunkLookupSession([chunk])

    embedding_calls = []
    website_enqueues = []

    monkeypatch.setattr(knowledge_base_jobs, "session_scope", lambda: FakeContext(session))
    monkeypatch.setattr(knowledge_base_jobs, "_file_documents_needing_backfill", lambda session: [document])
    monkeypatch.setattr(knowledge_base_jobs, "_website_sources_needing_backfill", lambda session: [(UUID(int=62), "user")])
    monkeypatch.setattr(
        knowledge_base_jobs,
        "upsert_knowledge_embedding",
        lambda session, chunk_id, user_id: embedding_calls.append((chunk_id, user_id)),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "enqueue_website_processing",
        lambda website_id, user_id: website_enqueues.append((website_id, user_id)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "log_info", lambda *args, **kwargs: None)

    process_knowledge_base_retrieval_backfill()

    assert document.content_language == "english"
    assert "Pricing Guide" in chunk.search_text
    assert embedding_calls == [(chunk.id, "user")]
    assert website_enqueues == [(UUID(int=62), "user")]


def test_process_document_invalid_id(monkeypatch):
    errors = []
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: errors.append(kwargs))
    process_document("not-a-uuid", "user", b"data", "test.pdf")
    assert errors


def test_process_document_no_chunks_sets_error(monkeypatch):
    session = TrackingSession()
    ctx = FakeContext(session)
    statuses = []

    monkeypatch.setattr(knowledge_base_jobs, "parse_document", lambda fb, fn: [])
    monkeypatch.setattr(knowledge_base_jobs, "chunk_elements", lambda e: [])
    monkeypatch.setattr(knowledge_base_jobs, "session_scope", lambda: ctx)
    monkeypatch.setattr(knowledge_base_jobs, "update_document_status", lambda s, did, st, chunk_count=None, error_message=None: statuses.append({"status": st, "error": error_message}))

    process_document(str(UUID(int=3)), "user", b"data", "test.pdf")
    assert statuses
    assert statuses[0]["status"] == knowledge_base_jobs.DocumentStatus.error


def test_process_document_handles_parse_error(monkeypatch):
    session = TrackingSession()
    ctx = FakeContext(session)
    statuses = []

    monkeypatch.setattr(knowledge_base_jobs, "parse_document", lambda fb, fn: (_ for _ in ()).throw(RuntimeError("parse fail")))
    monkeypatch.setattr(knowledge_base_jobs, "session_scope", lambda: ctx)
    monkeypatch.setattr(knowledge_base_jobs, "update_document_status", lambda s, did, st, chunk_count=None, error_message=None: statuses.append(st))
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: None)

    with pytest.raises(RuntimeError):
        process_document(str(UUID(int=4)), "user", b"data", "test.pdf")
    assert statuses


def test_sanitize_error_http_status():
    import httpx
    exc = httpx.HTTPStatusError("error", request=httpx.Request("POST", "http://internal.api"), response=httpx.Response(422))
    msg = _sanitize_error(exc)
    assert "http" not in msg.lower()
    assert "internal" not in msg.lower()
    assert "parsing service" in msg.lower()


def test_sanitize_error_connection():
    msg = _sanitize_error(ConnectionError("could not reach api.secret.com"))
    assert "secret" not in msg
    assert "parsing service" in msg.lower()


def test_sanitize_error_unknown():
    msg = _sanitize_error(ValueError("some internal detail"))
    assert "internal" not in msg
    assert "Something went wrong" in msg


def test_sanitize_error_timeout():
    class TimeoutException(Exception):
        pass
    msg = _sanitize_error(TimeoutException("took too long"))
    assert "timed out" in msg.lower()


def test_sanitize_website_error_timeout_name(monkeypatch):
    class TimeoutError(Exception):
        pass

    msg = knowledge_base_jobs._sanitize_website_error(TimeoutError("took too long"))
    assert "too long" in msg.lower()


def test_process_document_uses_sanitized_error(monkeypatch):
    session = TrackingSession()
    ctx = FakeContext(session)
    error_messages = []

    monkeypatch.setattr(knowledge_base_jobs, "parse_document", lambda fb, fn: (_ for _ in ()).throw(RuntimeError("Client error '422' for url 'https://api.unstructuredapp.io'")))
    monkeypatch.setattr(knowledge_base_jobs, "session_scope", lambda: ctx)
    monkeypatch.setattr(knowledge_base_jobs, "update_document_status", lambda s, did, st, chunk_count=None, error_message=None: error_messages.append(error_message))
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: None)

    with pytest.raises(RuntimeError):
        process_document(str(UUID(int=5)), "user", b"data", "test.pdf")
    assert error_messages
    assert "unstructuredapp" not in error_messages[0].lower()
    assert "422" not in error_messages[0]


class EmptySession:
    pass


def _fake_session_scope():
    return FakeContext(EmptySession())


def test_process_website_marks_partial_when_some_pages_fail(monkeypatch):
    website_id = UUID(int=8)
    website = SimpleNamespace(id=website_id, user_id="user", scope_url="https://example.com/docs")
    state_updates = []
    persisted_pages = []
    page_errors = []

    monkeypatch.setattr(knowledge_base_jobs, "session_scope", _fake_session_scope)
    monkeypatch.setattr(knowledge_base_jobs, "get_website_for_worker", lambda session, wid, user_id: website)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "update_website_state",
        lambda session, wid, user_id, status, **kwargs: state_updates.append((status, kwargs)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "upsert_website_page_processing", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "persist_website_page",
        lambda session, wid, user_id, original_url, page_url, page_name, file_size, source_hash, chunks: persisted_pages.append(page_url),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "mark_website_page_error",
        lambda session, wid, user_id, original_url, page_url, page_name, error_message: page_errors.append((page_url, error_message)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "delete_missing_website_pages", lambda *args, **kwargs: pytest.fail("should not delete missing pages on partial crawl"))
    monkeypatch.setattr(knowledge_base_jobs, "chunk_elements", lambda elements: [{"content": "chunk", "metadata": {}}])
    monkeypatch.setattr(knowledge_base_jobs, "log_info", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: None)

    class FakeClient:
        def close(self):
            return None

    class FakeBrowser:
        def close(self):
            return None

    monkeypatch.setattr(knowledge_base_jobs, "build_http_client", lambda: FakeClient())
    monkeypatch.setattr(knowledge_base_jobs, "BrowserRenderer", FakeBrowser)
    monkeypatch.setattr(knowledge_base_jobs, "discover_sitemap_urls", lambda client, scope_url: set())

    def fake_crawl_page(client, browser, current_url, scope_url):
        if current_url.endswith("/docs"):
            return SimpleNamespace(
                page_url="https://example.com/docs",
                page_name="Docs",
                elements=[{"type": "NarrativeText", "text": "root"}],
                file_size=120,
                source_hash="hash-root",
                links={"https://example.com/docs/page-1"},
            )
        raise knowledge_base_jobs.WebsiteCrawlError("This page is not publicly accessible")

    monkeypatch.setattr(knowledge_base_jobs, "crawl_page", fake_crawl_page)

    process_website(str(website_id), "user")

    assert persisted_pages == ["https://example.com/docs"]
    assert page_errors == [("https://example.com/docs/page-1", "This page is not publicly accessible")]
    assert state_updates[-1][0] == knowledge_base_jobs.WebsiteStatus.partial
    assert state_updates[-1][1]["error_message"] == knowledge_base_jobs.WEBSITE_PARTIAL_ERROR_MESSAGE


def test_process_website_marks_error_when_root_page_fails(monkeypatch):
    website_id = UUID(int=9)
    website = SimpleNamespace(id=website_id, user_id="user", scope_url="https://example.com/docs")
    state_updates = []

    monkeypatch.setattr(knowledge_base_jobs, "session_scope", _fake_session_scope)
    monkeypatch.setattr(knowledge_base_jobs, "get_website_for_worker", lambda session, wid, user_id: website)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "update_website_state",
        lambda session, wid, user_id, status, **kwargs: state_updates.append((status, kwargs)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "upsert_website_page_processing", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_base_jobs, "mark_website_page_error", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: None)

    class FakeClient:
        def close(self):
            return None

    class FakeBrowser:
        def close(self):
            return None

    monkeypatch.setattr(knowledge_base_jobs, "build_http_client", lambda: FakeClient())
    monkeypatch.setattr(knowledge_base_jobs, "BrowserRenderer", FakeBrowser)
    monkeypatch.setattr(knowledge_base_jobs, "discover_sitemap_urls", lambda client, scope_url: set())
    monkeypatch.setattr(
        knowledge_base_jobs,
        "crawl_page",
        lambda client, browser, current_url, scope_url: (_ for _ in ()).throw(
            knowledge_base_jobs.WebsiteCrawlError("This page is not publicly accessible")
        ),
    )

    process_website(str(website_id), "user")

    assert state_updates[-1][0] == knowledge_base_jobs.WebsiteStatus.error
    assert state_updates[-1][1]["error_message"] == "This page is not publicly accessible"


def test_process_website_deletes_missing_pages_after_successful_crawl(monkeypatch):
    website_id = UUID(int=10)
    website = SimpleNamespace(id=website_id, user_id="user", scope_url="https://example.com/docs")
    state_updates = []
    deleted_seen_urls = []

    monkeypatch.setattr(knowledge_base_jobs, "session_scope", _fake_session_scope)
    monkeypatch.setattr(knowledge_base_jobs, "get_website_for_worker", lambda session, wid, user_id: website)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "update_website_state",
        lambda session, wid, user_id, status, **kwargs: state_updates.append((status, kwargs)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "upsert_website_page_processing", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_base_jobs, "persist_website_page", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "delete_missing_website_pages",
        lambda session, wid, seen_urls: deleted_seen_urls.append(seen_urls),
    )
    monkeypatch.setattr(knowledge_base_jobs, "chunk_elements", lambda elements: [{"content": "chunk", "metadata": {}}])
    monkeypatch.setattr(knowledge_base_jobs, "log_info", lambda *args, **kwargs: None)

    class FakeClient:
        def close(self):
            return None

    class FakeBrowser:
        def close(self):
            return None

    monkeypatch.setattr(knowledge_base_jobs, "build_http_client", lambda: FakeClient())
    monkeypatch.setattr(knowledge_base_jobs, "BrowserRenderer", FakeBrowser)
    monkeypatch.setattr(knowledge_base_jobs, "discover_sitemap_urls", lambda client, scope_url: set())

    def fake_crawl_page(client, browser, current_url, scope_url):
        if current_url.endswith("/docs"):
            return SimpleNamespace(
                page_url="https://example.com/docs",
                page_name="Docs",
                elements=[{"type": "NarrativeText", "text": "root"}],
                file_size=120,
                source_hash="hash-root",
                links={"https://example.com/docs/page-1"},
            )
        return SimpleNamespace(
            page_url="https://example.com/docs/page-1",
            page_name="Page 1",
            elements=[{"type": "NarrativeText", "text": "child"}],
            file_size=120,
            source_hash="hash-page-1",
            links=set(),
        )

    monkeypatch.setattr(knowledge_base_jobs, "crawl_page", fake_crawl_page)

    process_website(str(website_id), "user")

    assert deleted_seen_urls == [{"https://example.com/docs", "https://example.com/docs/page-1"}]
    assert state_updates[-1][0] == knowledge_base_jobs.WebsiteStatus.ready


def test_process_website_refresh_sweep_enqueues_due_websites(monkeypatch):
    enqueued = []
    due_websites = [
        (UUID(int=11), "user-1"),
        (UUID(int=12), "user-2"),
    ]

    monkeypatch.setattr(knowledge_base_jobs, "session_scope", _fake_session_scope)
    monkeypatch.setattr(knowledge_base_jobs, "get_due_websites", lambda session, limit: due_websites)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "enqueue_website_processing",
        lambda website_id, user_id: enqueued.append((website_id, user_id)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "log_info", lambda *args, **kwargs: None)

    process_website_refresh_sweep()

    assert enqueued == [
        (UUID(int=11), "user-1"),
        (UUID(int=12), "user-2"),
    ]


def test_process_website_marks_error_when_only_discovery_pages_exist(monkeypatch):
    website_id = UUID(int=15)
    website = SimpleNamespace(id=website_id, user_id="user", scope_url="https://example.com/docs")
    state_updates = []
    discarded_pages = []

    monkeypatch.setattr(knowledge_base_jobs, "session_scope", _fake_session_scope)
    monkeypatch.setattr(knowledge_base_jobs, "get_website_for_worker", lambda session, wid, user_id: website)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "update_website_state",
        lambda session, wid, user_id, status, **kwargs: state_updates.append((status, kwargs)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "upsert_website_page_processing", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "discard_website_page_processing",
        lambda session, wid, page_url, alternate_url=None: discarded_pages.append((page_url, alternate_url)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "chunk_elements", lambda elements: [])
    monkeypatch.setattr(knowledge_base_jobs, "log_info", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: None)

    class FakeClient:
        def close(self):
            return None

    class FakeBrowser:
        def close(self):
            return None

    monkeypatch.setattr(knowledge_base_jobs, "build_http_client", lambda: FakeClient())
    monkeypatch.setattr(knowledge_base_jobs, "BrowserRenderer", FakeBrowser)
    monkeypatch.setattr(knowledge_base_jobs, "discover_sitemap_urls", lambda client, scope_url: set())
    monkeypatch.setattr(
        knowledge_base_jobs,
        "crawl_page",
        lambda client, browser, current_url, scope_url: SimpleNamespace(
            page_url=current_url,
            page_name="Docs",
            elements=[],
            file_size=120,
            source_hash="hash-root",
            links={"https://example.com/docs"} if current_url.endswith("/docs") else set(),
        ),
    )

    process_website(str(website_id), "user")

    assert discarded_pages
    assert state_updates[-1][0] == knowledge_base_jobs.WebsiteStatus.error
    assert state_updates[-1][1]["error_message"] == knowledge_base_jobs.WEBSITE_NO_CONTENT_ERROR_MESSAGE


def test_process_website_marks_partial_when_sitemap_discovery_is_truncated(monkeypatch):
    website_id = UUID(int=16)
    website = SimpleNamespace(id=website_id, user_id="user", scope_url="https://example.com/docs")
    state_updates = []

    monkeypatch.setattr(knowledge_base_jobs, "session_scope", _fake_session_scope)
    monkeypatch.setattr(knowledge_base_jobs, "get_website_for_worker", lambda session, wid, user_id: website)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "update_website_state",
        lambda session, wid, user_id, status, **kwargs: state_updates.append((status, kwargs)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "upsert_website_page_processing", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_base_jobs, "persist_website_page", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_base_jobs, "chunk_elements", lambda elements: [{"content": "chunk", "metadata": {}}])
    monkeypatch.setattr(knowledge_base_jobs, "log_info", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: None)

    class FakeClient:
        def close(self):
            return None

    class FakeBrowser:
        def close(self):
            return None

    monkeypatch.setattr(knowledge_base_jobs, "build_http_client", lambda: FakeClient())
    monkeypatch.setattr(knowledge_base_jobs, "BrowserRenderer", FakeBrowser)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "discover_sitemap_urls",
        lambda client, scope_url: SimpleNamespace(urls={"https://example.com/docs/page-1"}, truncated=True),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "crawl_page",
        lambda client, browser, current_url, scope_url: SimpleNamespace(
            page_url=current_url,
            page_name="Page",
            elements=[{"type": "NarrativeText", "text": "body"}],
            file_size=120,
            source_hash="hash-page",
            links=set(),
        ),
    )

    process_website(str(website_id), "user")

    assert state_updates[-1][0] == knowledge_base_jobs.WebsiteStatus.partial
    assert state_updates[-1][1]["error_message"] == knowledge_base_jobs.WEBSITE_LIMIT_ERROR_MESSAGE


def test_process_website_keeps_crawling_links_after_non_content_root(monkeypatch):
    website_id = UUID(int=13)
    website = SimpleNamespace(id=website_id, user_id="user", scope_url="https://example.com/docs")
    state_updates = []
    persisted_pages = []
    page_errors = []
    discarded_pages = []
    deleted_seen_urls = []

    monkeypatch.setattr(knowledge_base_jobs, "session_scope", _fake_session_scope)
    monkeypatch.setattr(knowledge_base_jobs, "get_website_for_worker", lambda session, wid, user_id: website)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "update_website_state",
        lambda session, wid, user_id, status, **kwargs: state_updates.append((status, kwargs)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "upsert_website_page_processing", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "persist_website_page",
        lambda session, wid, user_id, original_url, page_url, page_name, file_size, source_hash, chunks: persisted_pages.append(page_url),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "mark_website_page_error",
        lambda session, wid, user_id, original_url, page_url, page_name, error_message: page_errors.append((page_url, error_message)),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "discard_website_page_processing",
        lambda session, wid, page_url, alternate_url=None: discarded_pages.append((page_url, alternate_url)),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "delete_missing_website_pages",
        lambda session, wid, seen_urls: deleted_seen_urls.append(seen_urls),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "chunk_elements",
        lambda elements: [{"content": "chunk", "metadata": {}}] if elements else [],
    )
    monkeypatch.setattr(knowledge_base_jobs, "log_info", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: None)

    class FakeClient:
        def close(self):
            return None

    class FakeBrowser:
        def close(self):
            return None

    monkeypatch.setattr(knowledge_base_jobs, "build_http_client", lambda: FakeClient())
    monkeypatch.setattr(knowledge_base_jobs, "BrowserRenderer", FakeBrowser)
    monkeypatch.setattr(knowledge_base_jobs, "discover_sitemap_urls", lambda client, scope_url: set())

    def fake_crawl_page(client, browser, current_url, scope_url):
        if current_url.endswith("/docs"):
            return SimpleNamespace(
                page_url="https://example.com/docs",
                page_name="Docs",
                elements=[],
                file_size=120,
                source_hash="hash-root",
                links={"https://example.com/docs/page-1"},
            )
        return SimpleNamespace(
            page_url="https://example.com/docs/page-1",
            page_name="Page 1",
            elements=[{"type": "NarrativeText", "text": "child"}],
            file_size=120,
            source_hash="hash-page-1",
            links=set(),
        )

    monkeypatch.setattr(knowledge_base_jobs, "crawl_page", fake_crawl_page)

    process_website(str(website_id), "user")

    assert persisted_pages == ["https://example.com/docs/page-1"]
    assert page_errors == []
    assert discarded_pages == [("https://example.com/docs", "https://example.com/docs")]
    assert deleted_seen_urls == [{"https://example.com/docs/page-1"}]
    assert state_updates[-1][0] == knowledge_base_jobs.WebsiteStatus.ready


def test_process_website_seeds_sitemap_urls_when_root_page_fails(monkeypatch):
    website_id = UUID(int=14)
    website = SimpleNamespace(id=website_id, user_id="user", scope_url="https://example.com/docs")
    state_updates = []
    persisted_pages = []
    page_errors = []
    discarded_pages = []
    deleted_seen_urls = []

    monkeypatch.setattr(knowledge_base_jobs, "session_scope", _fake_session_scope)
    monkeypatch.setattr(knowledge_base_jobs, "get_website_for_worker", lambda session, wid, user_id: website)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "update_website_state",
        lambda session, wid, user_id, status, **kwargs: state_updates.append((status, kwargs)),
    )
    monkeypatch.setattr(knowledge_base_jobs, "upsert_website_page_processing", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "persist_website_page",
        lambda session, wid, user_id, original_url, page_url, page_name, file_size, source_hash, chunks: persisted_pages.append(page_url),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "mark_website_page_error",
        lambda session, wid, user_id, original_url, page_url, page_name, error_message: page_errors.append((page_url, error_message)),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "discard_website_page_processing",
        lambda session, wid, page_url, alternate_url=None: discarded_pages.append((page_url, alternate_url)),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "delete_missing_website_pages",
        lambda session, wid, seen_urls: deleted_seen_urls.append(seen_urls),
    )
    monkeypatch.setattr(
        knowledge_base_jobs,
        "chunk_elements",
        lambda elements: [{"content": "chunk", "metadata": {}}] if elements else [],
    )
    monkeypatch.setattr(knowledge_base_jobs, "log_info", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_base_jobs, "log_error", lambda *args, **kwargs: None)

    class FakeClient:
        def close(self):
            return None

    class FakeBrowser:
        def close(self):
            return None

    monkeypatch.setattr(knowledge_base_jobs, "build_http_client", lambda: FakeClient())
    monkeypatch.setattr(knowledge_base_jobs, "BrowserRenderer", FakeBrowser)
    monkeypatch.setattr(
        knowledge_base_jobs,
        "discover_sitemap_urls",
        lambda client, scope_url: {"https://example.com/docs/page-1"},
    )

    def fake_crawl_page(client, browser, current_url, scope_url):
        if current_url.endswith("/docs"):
            return SimpleNamespace(
                page_url="https://example.com/docs",
                page_name="Docs",
                elements=[],
                file_size=120,
                source_hash="hash-root",
                links=set(),
            )
        return SimpleNamespace(
            page_url="https://example.com/docs/page-1",
            page_name="Page 1",
            elements=[{"type": "NarrativeText", "text": "child"}],
            file_size=120,
            source_hash="hash-page-1",
            links=set(),
        )

    monkeypatch.setattr(knowledge_base_jobs, "crawl_page", fake_crawl_page)

    process_website(str(website_id), "user")

    assert persisted_pages == ["https://example.com/docs/page-1"]
    assert page_errors == []
    assert discarded_pages == [("https://example.com/docs", "https://example.com/docs")]
    assert deleted_seen_urls == [{"https://example.com/docs/page-1"}]
    assert state_updates[-1][0] == knowledge_base_jobs.WebsiteStatus.ready
