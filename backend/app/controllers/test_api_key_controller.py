import importlib

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.auth import ClerkSession


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch: pytest.MonkeyPatch):
    from app.core import database
    from app.core.config import get_settings

    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test")
    monkeypatch.setenv("WIDGET_JWT_SECRET", "secret")
    monkeypatch.setenv("API_KEY_ENCRYPTION_SECRET", "api-key-secret")
    get_settings.cache_clear()
    importlib.reload(database)
    database._engine = None
    database._SessionLocal = None
    from app.models import Base

    engine = database.get_engine()
    Base.metadata.create_all(engine)
    try:
        yield
    finally:
        engine.dispose()


@pytest.fixture(autouse=True)
def stub_auth(monkeypatch: pytest.MonkeyPatch):
    session = ClerkSession(id="sess_1", user_id="user_1", status="active")
    monkeypatch.setattr("app.core.auth.verify_clerk_session", lambda token, forwarded_headers=None: session)
    return session


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as client:
        yield client


def auth_headers():
    return {"Authorization": "Bearer token"}


def test_api_key_is_auto_created_and_can_be_revealed_and_rotated(client: TestClient):
    summary = client.get("/api-key", headers=auth_headers())
    assert summary.status_code == 200
    first_body = summary.json()
    assert first_body["apiKeyLast4"]
    assert first_body["createdAt"]
    assert first_body["rotatedAt"] is None

    revealed = client.post("/api-key/reveal", headers=auth_headers())
    assert revealed.status_code == 200
    reveal_body = revealed.json()
    assert reveal_body["apiKey"].startswith("wrk_")
    assert reveal_body["apiKeyLast4"] == first_body["apiKeyLast4"]

    rotated = client.post("/api-key/rotate", headers=auth_headers())
    assert rotated.status_code == 200
    rotated_body = rotated.json()
    assert rotated_body["apiKey"].startswith("wrk_")
    assert rotated_body["apiKeyLast4"] != first_body["apiKeyLast4"]
    assert rotated_body["rotatedAt"] is not None


def test_dashboard_routes_accept_warpy_api_key(client: TestClient):
    create_agent = client.post("/agent", headers=auth_headers())
    assert create_agent.status_code == 201

    revealed = client.post("/api-key/reveal", headers=auth_headers())
    api_key = revealed.json()["apiKey"]
    key_headers = {"Authorization": f"Bearer {api_key}"}

    assert client.get("/config", headers=key_headers).status_code == 200
    assert client.get("/features", headers=key_headers).status_code == 200
    assert client.get("/tools", headers=key_headers).status_code == 200
    assert client.get("/agent", headers=key_headers).status_code == 200
    assert client.get("/agent/widget-security", headers=key_headers).status_code == 200
    assert client.get("/billing", headers=key_headers).status_code == 200
    assert client.get("/activity/summary", headers=key_headers).status_code == 200
    assert client.get("/knowledge-base/status", headers=key_headers).status_code == 200
    assert client.get("/mcp-connections", headers=key_headers).status_code == 200
    assert client.get("/onboarding/state", headers=key_headers).status_code == 200


def test_invalid_warpy_api_key_is_rejected(client: TestClient):
    response = client.get("/config", headers={"Authorization": "Bearer wrk_invalid"})
    assert response.status_code == 401
