import base64
import json
from typing import Any
from urllib.error import HTTPError, URLError

import pytest
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.testclient import TestClient

from .auth import require_clerk_session, verify_clerk_session
from .config import Settings, get_settings
from ..schemas.auth import ClerkSession


class FakeResponse:
    def __init__(self, payload: Any, *, raw: bytes | None = None):
        self._payload = payload
        self._raw = raw

    def read(self) -> bytes:
        if self._raw is not None:
            return self._raw
        return json.dumps(self._payload).encode()

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False


def configure_settings(monkeypatch: pytest.MonkeyPatch, **overrides: Any) -> Settings:
    get_settings.cache_clear()
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    config = Settings(clerk_secret_key="sk_test", **overrides)

    def fake_get_settings() -> Settings:
        return config

    monkeypatch.setattr("app.core.auth.get_settings", fake_get_settings)
    return config


def build_app():
    app = FastAPI()

    @app.get("/secure")
    async def secure_endpoint(session: ClerkSession = Depends(require_clerk_session)):
        return {"session_id": session.id, "user_id": session.user_id, "status": session.status}

    return app


def test_require_session_rejects_missing_credentials(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    app = build_app()
    client = TestClient(app)
    response = client.get("/secure")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_require_session_rejects_invalid_scheme(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    app = build_app()
    client = TestClient(app)
    response = client.get("/secure", headers={"Authorization": "Basic abc"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_require_session_rejects_missing_secret(monkeypatch: pytest.MonkeyPatch):
    get_settings.cache_clear()
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    app = build_app()
    client = TestClient(app)
    response = client.get("/secure", headers={"Authorization": "Bearer token"})
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


def test_require_session_success(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    session = ClerkSession(id="sess_1", user_id="user_1", status="active")

    def fake_verify(token: str, forwarded_headers=None) -> ClerkSession:
        assert token == "token"
        return session

    monkeypatch.setattr("app.core.auth.verify_clerk_session", fake_verify)
    app = build_app()
    client = TestClient(app)
    response = client.get("/secure", headers={"Authorization": "Bearer token"})
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"session_id": "sess_1", "user_id": "user_1", "status": "active"}


def test_verify_clerk_session_success(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)

    def fake_urlopen(request, timeout):
        return FakeResponse({"session": {"id": "sess_1", "user_id": "user_1", "status": "active"}})

    monkeypatch.setattr("app.core.auth.urlopen", fake_urlopen)
    result = verify_clerk_session("token")
    assert result.id == "sess_1"
    assert result.user_id == "user_1"
    assert result.status == "active"


def test_verify_clerk_session_handles_alias_fields(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)

    def fake_urlopen(request, timeout):
        return FakeResponse({"session_id": "sess_2", "user_id": "user_2"})

    monkeypatch.setattr("app.core.auth.urlopen", fake_urlopen)
    result = verify_clerk_session("token")
    assert result.id == "sess_2"
    assert result.user_id == "user_2"


def test_verify_clerk_session_handles_http_error(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    error = HTTPError("https://api.clerk.com", 401, "unauthorized", hdrs=None, fp=None)

    def raise_error(request, timeout):
        raise error

    monkeypatch.setattr("app.core.auth.urlopen", raise_error)
    with pytest.raises(HTTPException) as exc:
        verify_clerk_session("token")
    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED


def test_verify_clerk_session_handles_service_error(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    error = HTTPError("https://api.clerk.com", 500, "error", hdrs=None, fp=None)

    def raise_error(request, timeout):
        raise error

    monkeypatch.setattr("app.core.auth.urlopen", raise_error)
    with pytest.raises(HTTPException) as exc:
        verify_clerk_session("token")
    assert exc.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


def test_verify_clerk_session_handles_network_error(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)

    def raise_error(request, timeout):
        raise URLError("offline")

    monkeypatch.setattr("app.core.auth.urlopen", raise_error)
    with pytest.raises(HTTPException) as exc:
        verify_clerk_session("token")
    assert exc.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


def test_verify_clerk_session_handles_invalid_json(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)

    def fake_urlopen(request, timeout):
        return FakeResponse({}, raw=b"{invalid")

    monkeypatch.setattr("app.core.auth.urlopen", fake_urlopen)
    with pytest.raises(HTTPException) as exc:
        verify_clerk_session("token")
    assert exc.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


def test_verify_clerk_session_handles_missing_fields(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)

    def fake_urlopen(request, timeout):
        return FakeResponse({"session": {"status": "active"}})

    monkeypatch.setattr("app.core.auth.urlopen", fake_urlopen)
    with pytest.raises(HTTPException) as exc:
        verify_clerk_session("token")
    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED


def test_verify_clerk_session_sends_session_id(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    captured: dict[str, Any] = {}

    def fake_urlopen(request, timeout):
        captured["payload"] = json.loads(request.data.decode())
        return FakeResponse({"session": {"id": "sess_1", "user_id": "user_1"}})

    monkeypatch.setattr("app.core.auth.urlopen", fake_urlopen)

    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(
        json.dumps({"sid": "sess_42", "cid": "client_1", "sub": "user_3"}).encode()
    ).rstrip(b"=").decode()
    token = f"{header}.{payload}."

    verify_clerk_session(token)
    assert captured["payload"] == {
        "session_token": token,
        "session_id": "sess_42",
        "client_id": "client_1",
        "user_id": "user_3"
    }
