from uuid import UUID

import pytest

from app.workers import embedding_jobs
from app.workers.embedding_jobs import enqueue_tool_embedding, process_tool_embedding


class FakeQueue:
    def __init__(self):
        self.calls = []

    def enqueue(self, func, *args, **kwargs):
        self.calls.append((func, args, kwargs))


def test_enqueue_tool_embedding(monkeypatch: pytest.MonkeyPatch):
    queue = FakeQueue()
    monkeypatch.setattr(embedding_jobs, "get_queue", lambda name="default": queue)
    enqueue_tool_embedding(UUID(int=1), "user")
    assert queue.calls
    func, args, kwargs = queue.calls[0]
    assert func is process_tool_embedding
    assert args == ("00000000-0000-0000-0000-000000000001", "user")
    assert kwargs.get("retry") is embedding_jobs.retry_policy


def test_enqueue_tool_embedding_handles_failure(monkeypatch: pytest.MonkeyPatch):
    class FailingQueue:
        def enqueue(self, *args, **kwargs):
            raise RuntimeError("fail")

    errors: list[dict] = []
    monkeypatch.setattr(embedding_jobs, "get_queue", lambda name="default": FailingQueue())
    monkeypatch.setattr(embedding_jobs, "log_error", lambda *args, **kwargs: errors.append(kwargs))
    enqueue_tool_embedding(UUID(int=2), "user")
    assert errors


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


def test_process_tool_embedding_uses_upsert(monkeypatch: pytest.MonkeyPatch):
    session = object()
    ctx = FakeContext(session)
    calls: list[tuple] = []
    monkeypatch.setattr(embedding_jobs, "session_scope", lambda: ctx)
    monkeypatch.setattr(embedding_jobs, "upsert_tool_embedding", lambda s, eid, uid: calls.append((s, eid, uid)) or object())
    monkeypatch.setattr(embedding_jobs, "log_info", lambda *args, **kwargs: None)
    process_tool_embedding("00000000-0000-0000-0000-00000000000f", "user-x")
    assert ctx.entered and ctx.exited
    assert calls[0][0] is session
    assert calls[0][1] == UUID(int=15)
    assert calls[0][2] == "user-x"


def test_process_tool_embedding_handles_invalid_id(monkeypatch: pytest.MonkeyPatch):
    errors: list[dict] = []
    monkeypatch.setattr(embedding_jobs, "log_error", lambda *args, **kwargs: errors.append(kwargs))
    process_tool_embedding("not-a-uuid", "user-y")
    assert errors
