import pytest
from fastapi.testclient import TestClient

from ..schemas.auth import ClerkSession
from app.main import create_app


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch: pytest.MonkeyPatch):
    from app.core.config import Settings, get_settings

    get_settings.cache_clear()
    config = Settings(clerk_secret_key="sk_test")

    def fake_get_settings() -> Settings:
        return config

    monkeypatch.setattr("app.core.auth.get_settings", fake_get_settings)
    return config


def test_me_requires_auth():
    app = create_app()
    client = TestClient(app)
    response = client.get("/me")
    assert response.status_code == 401


def test_me_returns_session(monkeypatch: pytest.MonkeyPatch):
    app = create_app()
    client = TestClient(app)
    session = ClerkSession(id="sess_1", user_id="user_1", status="active")
    monkeypatch.setattr("app.core.auth.verify_clerk_session", lambda token, forwarded_headers=None: session)

    response = client.get("/me", headers={"Authorization": "Bearer token"})
    assert response.status_code == 200
    assert response.json() == {"session_id": "sess_1", "user_id": "user_1", "status": "active"}
