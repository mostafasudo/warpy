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
    get_settings.cache_clear()
    importlib.reload(database)
    database._engine = None
    database._SessionLocal = None
    from app.models import Base

    engine = database.get_engine()
    Base.metadata.create_all(engine)
    try:
        yield get_settings()
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


def test_mcp_connection_crud_flow(client: TestClient):
    create_payload = {
        "name": "Stripe MCP",
        "serverUrl": "https://example.com/mcp",
        "authMode": "token_exchange",
        "tokenExchangePath": "/api/mcp/token-exchange",
    }
    create = client.post("/mcp-connections", json=create_payload, headers=auth_headers())
    assert create.status_code == 201
    created = create.json()
    assert created["name"] == "Stripe MCP"
    assert created["authMode"] == "token_exchange"
    assert created["staticHeaders"] is None

    listed = client.get("/mcp-connections", headers=auth_headers())
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == created["id"]

    update = client.put(
        f"/mcp-connections/{created['id']}",
        json={
            "name": "Stripe MCP v2",
            "serverUrl": "https://example.com/mcp/v2",
            "authMode": "static_headers",
            "staticHeaders": {"Authorization": "Bearer secret"},
        },
        headers=auth_headers(),
    )
    assert update.status_code == 200
    assert update.json()["name"] == "Stripe MCP v2"
    assert update.json()["tokenExchangePath"] is None
    assert update.json()["staticHeaders"] == {"Authorization": "Bearer secret"}

    delete = client.delete(f"/mcp-connections/{created['id']}", headers=auth_headers())
    assert delete.status_code == 204
    assert client.get("/mcp-connections", headers=auth_headers()).json() == []


def test_mcp_connection_validation(client: TestClient):
    response = client.post(
        "/mcp-connections",
        json={
            "name": "Broken",
            "serverUrl": "https://example.com/mcp",
            "authMode": "token_exchange",
            "tokenExchangePath": "api/mcp/token-exchange",
        },
        headers=auth_headers(),
    )
    assert response.status_code == 422
    assert "Token exchange path must be a same-origin path starting with /" in response.text

    response = client.post(
        "/mcp-connections",
        json={
            "name": "Broken 2",
            "serverUrl": "https://example.com/mcp",
            "authMode": "token_exchange",
            "tokenExchangePath": "//evil.example/steal",
        },
        headers=auth_headers(),
    )
    assert response.status_code == 422
    assert "Token exchange path must be a same-origin path starting with /" in response.text

    response = client.post(
        "/mcp-connections",
        json={
            "name": "Headers",
            "serverUrl": "https://example.com/mcp",
            "authMode": "static_headers",
            "staticHeaders": {},
        },
        headers=auth_headers(),
    )
    assert response.status_code == 422
    assert "Static headers are required" in response.text

    response = client.post(
        "/mcp-connections",
        json={
            "name": "Private",
            "serverUrl": "http://127.0.0.1:8000/mcp",
            "authMode": "none",
        },
        headers=auth_headers(),
    )
    assert response.status_code == 422
    assert "Enter a public MCP server URL" in response.text


def test_mcp_connections_are_user_scoped(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    create = client.post(
        "/mcp-connections",
        json={"name": "Stripe MCP", "serverUrl": "https://example.com/mcp", "authMode": "none"},
        headers=auth_headers(),
    )
    connection_id = create.json()["id"]

    monkeypatch.setattr(
        "app.core.auth.verify_clerk_session",
        lambda token, forwarded_headers=None: ClerkSession(id="sess_2", user_id="user_2", status="active"),
    )

    listed = client.get("/mcp-connections", headers=auth_headers())
    assert listed.status_code == 200
    assert listed.json() == []

    missing = client.delete(f"/mcp-connections/{connection_id}", headers=auth_headers())
    assert missing.status_code == 404
