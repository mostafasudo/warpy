import types

import pytest

from app.models import HttpMethod
from app.services import agent_execution
from app.services.agent_execution import execute_backend_tool


class DummyBackendTool:
    def __init__(self, path: str, method: HttpMethod, tool_id: str = "tool-1"):
        self.path = path
        self.method = method
        self.id = tool_id


class DummyEnvironment:
    def __init__(self, base_url: str):
        self.base_url = base_url


class DummySession:
    def __init__(self, environment: DummyEnvironment | None):
        self.environment = environment

    def scalar(self, _query):
        return self.environment


def test_execute_backend_tool_invalid_scheme():
    session = DummySession(environment=DummyEnvironment("ftp://example"))
    tool_record = DummyBackendTool("/users", HttpMethod.get)
    result = execute_backend_tool(session, "user", tool_record, {}, enforce_billing=False)
    assert "Invalid URL scheme" in result["error"]


def test_execute_backend_tool_timeout(monkeypatch: pytest.MonkeyPatch):
    class TimeoutClient:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def request(self, *_args, **_kwargs):
            raise agent_execution.httpx.TimeoutException()

    monkeypatch.setattr(agent_execution, "httpx", types.SimpleNamespace(Client=lambda: TimeoutClient(), TimeoutException=Exception))
    session = DummySession(environment=DummyEnvironment("http://api.test"))
    tool_record = DummyBackendTool("/users", HttpMethod.get)
    result = execute_backend_tool(session, "user", tool_record, {}, enforce_billing=False)
    assert result["error"] == "Request timed out"


def test_execute_backend_tool_other_error(monkeypatch: pytest.MonkeyPatch):
    class ErrorClient:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def request(self, *_args, **_kwargs):
            raise RuntimeError("boom")

    Timeout = type("Timeout", (Exception,), {})
    monkeypatch.setattr(agent_execution, "httpx", types.SimpleNamespace(Client=lambda: ErrorClient(), TimeoutException=Timeout))
    session = DummySession(environment=DummyEnvironment("http://api.test"))
    tool_record = DummyBackendTool("/users", HttpMethod.get)
    result = execute_backend_tool(session, "user", tool_record, {}, enforce_billing=False)
    assert "boom" in result["error"]


def test_execute_backend_tool_handles_unused_params_and_text_body(monkeypatch: pytest.MonkeyPatch):
    class TextResponse:
        def __init__(self):
            self.status_code = 200
            self.text = "plain"
        def json(self):
            raise ValueError("no json")
    class Client:
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc, tb):
            return False
        def request(self, *_args, **_kwargs):
            return TextResponse()
    monkeypatch.setattr(agent_execution, "httpx", types.SimpleNamespace(Client=lambda: Client(), TimeoutException=type("T", (Exception,), {})))
    session = DummySession(environment=DummyEnvironment("http://api.test"))
    tool_record = DummyBackendTool("/users/{id}", HttpMethod.get)
    result = execute_backend_tool(session, "user", tool_record, {"params": {"id": 1, "extra": 2}}, enforce_billing=False)
    assert result == {"status_code": 200, "body": "plain"}
