import importlib
from uuid import UUID

import pytest
from fastapi import HTTPException
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
    return get_settings()


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


def build_tool(name: str, description: str):
    return {
        "type": "function",
        "function": {"name": name, "description": description, "parameters": {"type": "object", "properties": {}}}
    }


def test_endpoint_crud_flow(client: TestClient):
    payload = {"path": "/users/{id}", "method": "GET", "tool": build_tool("getUser", "Fetch user")}
    response = client.post("/endpoints", json=payload, headers=auth_headers())
    assert response.status_code == 201
    created = response.json()
    endpoint_id = created["id"]
    UUID(endpoint_id)
    assert created["method"] == "GET"
    assert created["tool"] == build_tool("getUser", "Fetch user")

    response = client.get("/endpoints", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["page"] == 1
    assert data["pageSize"] == 20
    assert data["items"][0]["id"] == endpoint_id

    update_payload = {"path": "/users", "method": "POST", "tool": build_tool("createUser", "Create user")}
    response = client.put(f"/endpoints/{endpoint_id}", json=update_payload, headers=auth_headers())
    assert response.status_code == 200
    updated = response.json()
    assert updated["path"] == "/users"
    assert updated["method"] == "POST"
    assert updated["tool"] == build_tool("createUser", "Create user")

    response = client.delete(f"/endpoints/{endpoint_id}", headers=auth_headers())
    assert response.status_code == 204

    response = client.get("/endpoints", headers=auth_headers())
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_search_filters_endpoints(client: TestClient):
    entries = [
        {"path": "/users/{id}", "method": "GET", "tool": build_tool("getUser", "Fetch profile")},
        {"path": "/orders", "method": "POST", "tool": build_tool("createOrder", "Submit order for user")},
        {"path": "/sessions", "method": "GET", "tool": build_tool("listSessions", "List active sessions")}
    ]
    for entry in entries:
        response = client.post("/endpoints", json=entry, headers=auth_headers())
        assert response.status_code == 201

    response = client.get("/endpoints?search=order", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["path"] == "/orders"

    response = client.get("/endpoints?search=sess", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["tool"]["function"]["name"] == "listSessions"

    response = client.get("/endpoints?search=ofile", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["path"] == "/users/{id}"


def test_invalid_pagination_returns_error(client: TestClient):
    response = client.get("/endpoints?page=0&page_size=0", headers=auth_headers())
    assert response.status_code == 422


def test_list_endpoints_service_validation(client: TestClient):
    from app.core.database import session_scope
    from app.services.endpoint_service import list_endpoints

    with session_scope() as session:
        with pytest.raises(HTTPException) as exc:
            list_endpoints(session, 0, 1)
        assert exc.value.status_code == 400
        with pytest.raises(HTTPException) as exc:
            list_endpoints(session, 1, 0)
        assert exc.value.status_code == 400
