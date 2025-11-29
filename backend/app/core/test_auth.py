from typing import Any

import pytest
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.testclient import TestClient

from .auth import require_clerk_session, verify_clerk_session
from .config import Settings, get_settings
from ..schemas.auth import ClerkSession


def configure_settings(monkeypatch: pytest.MonkeyPatch, **overrides: Any) -> Settings:
    get_settings.cache_clear()
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    config = Settings(clerk_secret_key="sk_test", **overrides)

    def fake_get_settings() -> Settings:
        return config

    monkeypatch.setattr("app.core.auth.get_settings", fake_get_settings)
    from app.core import auth
    auth._get_clerk_client.cache_clear()
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


class FakeRequestState:
    def __init__(self, is_signed_in: bool = True, payload: dict[str, Any] | None = None, reason: str | None = None):
        self.is_signed_in = is_signed_in
        self.payload = payload or {}
        self.reason = reason


class FakeClerk:
    def __init__(self, state: FakeRequestState | None = None, error: Exception | None = None):
        self.state = state
        self.error = error
        self.calls: list[dict[str, Any]] = []

    def authenticate_request(self, request, options):
        self.calls.append({"headers": dict(request.headers)})
        if self.error:
            raise self.error
        return self.state


def use_fake_clerk(monkeypatch: pytest.MonkeyPatch, state: FakeRequestState | None = None, error: Exception | None = None) -> FakeClerk:
    fake = FakeClerk(state=state, error=error)
    from app.core import auth
    auth._get_clerk_client.cache_clear()
    monkeypatch.setattr("app.core.auth._get_clerk_client", lambda: fake)
    return fake


def test_get_clerk_client_uses_settings(monkeypatch: pytest.MonkeyPatch):
    class DummyClerk:
        def __init__(self, bearer_auth):
            self.bearer_auth = bearer_auth
    monkeypatch.setattr("app.core.auth.Clerk", DummyClerk)
    from app.core.config import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_dummy")
    from app.core import auth
    auth._get_clerk_client.cache_clear()
    client = auth._get_clerk_client()
    assert client.bearer_auth == "sk_dummy"


def test_verify_clerk_session_success(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    state = FakeRequestState(payload={"sid": "sess_1", "sub": "user_1", "sts": "active"})
    use_fake_clerk(monkeypatch, state=state)
    result = verify_clerk_session("token")
    assert result.id == "sess_1"
    assert result.user_id == "user_1"
    assert result.status == "active"


def test_verify_clerk_session_requires_signed_in(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    state = FakeRequestState(is_signed_in=False, reason="signed_out")
    use_fake_clerk(monkeypatch, state=state)
    with pytest.raises(HTTPException) as exc:
        verify_clerk_session("token")
    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc.value.detail == "signed_out"


def test_verify_clerk_session_requires_payload(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    state = FakeRequestState(payload={})
    use_fake_clerk(monkeypatch, state=state)
    with pytest.raises(HTTPException) as exc:
        verify_clerk_session("token")
    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED


def test_verify_clerk_session_requires_claims(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    state = FakeRequestState(payload={"sid": "sess_1"})
    use_fake_clerk(monkeypatch, state=state)
    with pytest.raises(HTTPException) as exc:
        verify_clerk_session("token")
    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED


def test_verify_clerk_session_handles_client_error(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    use_fake_clerk(monkeypatch, error=RuntimeError("boom"))
    with pytest.raises(HTTPException) as exc:
        verify_clerk_session("token")
    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED


def test_verify_clerk_session_uses_forwarded_headers(monkeypatch: pytest.MonkeyPatch):
    configure_settings(monkeypatch)
    state = FakeRequestState(payload={"sid": "sess_1", "sub": "user_1"})
    fake = use_fake_clerk(monkeypatch, state=state)
    verify_clerk_session("token", {"X-Test": "123"})
    headers = fake.calls[0]["headers"]
    assert headers["authorization"] == "Bearer token"
    assert headers["x-test"] == "123"
