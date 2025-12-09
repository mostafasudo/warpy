import types

import pytest

from app.models import HttpMethod
from app.services import agent_execution
from app.services.agent_execution import execute_endpoint, substitute_path_params


class DummyEndpoint:
    def __init__(self, path: str, method: HttpMethod, endpoint_id: str = "endpoint-1"):
        self.path = path
        self.method = method
        self.id = endpoint_id


class DummyEnvironment:
    def __init__(self, base_url: str):
        self.base_url = base_url


class DummySession:
    def __init__(self, environment: DummyEnvironment | None):
        self.environment = environment

    def scalar(self, _query):
        return self.environment


class DummyResponse:
    def __init__(self, status_code: int, json_body):
        self.status_code = status_code
        self._json_body = json_body
        self.text = "text"

    def json(self):
        if isinstance(self._json_body, Exception):
            raise self._json_body
        return self._json_body


class DummyHttpClient:
    def __init__(self, response: DummyResponse, calls: list):
        self.response = response
        self.calls = calls

    def request(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        return self.response

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_substitute_path_params_tracks_remaining():
    path, remaining = substitute_path_params("/users/{id}/posts/{postId}", {"id": 1})
    assert path == "/users/1/posts/{postId}"
    assert remaining == {}


def test_execute_endpoint_requires_environment():
    session = DummySession(environment=None)
    endpoint = DummyEndpoint("/users", HttpMethod.get)
    result = execute_endpoint(session, "user", endpoint, {})
    assert result["error"]


def test_execute_endpoint_uses_http_client(monkeypatch: pytest.MonkeyPatch):
    calls: list = []
    dummy_response = DummyResponse(200, RuntimeError("no json"))
    client = DummyHttpClient(dummy_response, calls)
    monkeypatch.setattr(agent_execution, "httpx", types.SimpleNamespace(Client=lambda: client, TimeoutException=Exception))

    session = DummySession(environment=DummyEnvironment("http://api.test"))
    endpoint = DummyEndpoint("/users/{id}", HttpMethod.post)
    result = execute_endpoint(
        session,
        "user",
        endpoint,
        {"params": {"id": 9}, "query": {"q": "x"}, "body": {"k": "v"}, "headers": {"H": "1"}}
    )

    assert result == {"status_code": 200, "body": "text"}
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"] == "http://api.test/users/9"
    assert calls[0]["kwargs"]["params"] == {"q": "x"}
    assert calls[0]["kwargs"]["json"] == {"k": "v"}
    assert calls[0]["kwargs"]["headers"] == {"H": "1"}


def test_execute_endpoint_rejects_get_body(monkeypatch: pytest.MonkeyPatch):
    calls: list = []
    client = DummyHttpClient(DummyResponse(200, {"ok": True}), calls)
    monkeypatch.setattr(agent_execution, "httpx", types.SimpleNamespace(Client=lambda: client, TimeoutException=Exception))

    session = DummySession(environment=DummyEnvironment("http://api.test"))
    endpoint = DummyEndpoint("/products", HttpMethod.get)
    result = execute_endpoint(session, "user", endpoint, {"body": {"ping": "pong"}})

    assert result["error"] == "GET requests cannot include a body"
    assert calls == []


def test_dummy_response_json_returns_value():
    response = DummyResponse(200, {"k": "v"})
    assert response.json() == {"k": "v"}
