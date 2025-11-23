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


def test_endpoint_crud_flow(client: TestClient):
    payload = {"path": "/users/{id}", "method": "GET", "tool": {"name": "getUser"}}
    response = client.post("/endpoints", json=payload, headers=auth_headers())
    assert response.status_code == 201
    created = response.json()
    endpoint_id = created["id"]
    UUID(endpoint_id)
    assert created["method"] == "GET"
    assert created["tool"] == {"name": "getUser"}

    response = client.get("/endpoints", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["page"] == 1
    assert data["pageSize"] == 20
    assert data["items"][0]["id"] == endpoint_id

    update_payload = {"path": "/users", "method": "POST", "tool": {"name": "createUser"}}
    response = client.put(f"/endpoints/{endpoint_id}", json=update_payload, headers=auth_headers())
    assert response.status_code == 200
    updated = response.json()
    assert updated["path"] == "/users"
    assert updated["method"] == "POST"
    assert updated["tool"] == {"name": "createUser"}

    response = client.delete(f"/endpoints/{endpoint_id}", headers=auth_headers())
    assert response.status_code == 204

    response = client.get("/endpoints", headers=auth_headers())
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


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
