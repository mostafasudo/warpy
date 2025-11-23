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


def test_get_config_bootstraps_required_environments(client: TestClient):
    response = client.get("/config", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert set(data["baseUrl"].keys()) == {"local", "production"}
    assert data["headers"] == {}


def test_put_config_upserts_and_replaces_headers(client: TestClient):
    first_payload = {
        "baseUrl": {
            "local": "http://localhost:3000",
            "production": "https://api.example.com",
            "staging": "https://staging.example.com"
        },
        "headers": {
            "authToken": {"source": "localStorage", "key": "authorization"},
            "csrf": {"source": "cookies", "key": "csrfToken"}
        }
    }
    response = client.put("/config", json=first_payload, headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["baseUrl"]["staging"] == "https://staging.example.com"
    assert set(data["headers"].keys()) == {"authToken", "csrf"}

    second_payload = {
        "baseUrl": {
            "local": "http://localhost:4000",
            "production": "https://api.example.com"
        },
        "headers": {
            "session": {"source": "sessionStorage", "key": "sid"}
        }
    }
    response = client.put("/config", json=second_payload, headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert set(data["baseUrl"].keys()) == {"local", "production"}
    assert data["baseUrl"]["local"] == "http://localhost:4000"
    assert data["headers"] == {"session": {"source": "sessionStorage", "key": "sid"}}

    response = client.get("/config", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "staging" not in data["baseUrl"]
    assert data["headers"] == {"session": {"source": "sessionStorage", "key": "sid"}}


def test_put_config_requires_local_and_production(client: TestClient):
    payload = {
        "baseUrl": {"local": "http://localhost:3000"},
        "headers": {}
    }
    response = client.put("/config", json=payload, headers=auth_headers())
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required environments: production"
