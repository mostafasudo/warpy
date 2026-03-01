from uuid import UUID

import pytest

from app.workers import knowledge_base_jobs
from app.workers.knowledge_base_jobs import _sanitize_error, enqueue_document_processing, process_document


class FakeQueue:
    def __init__(self):
        self.calls = []

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
