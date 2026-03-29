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


def test_get_config_bootstraps_required_environments(client: TestClient):
    response = client.get("/config", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert set(data["baseUrl"].keys()) == {"local", "production"}
    assert data["auth"] == {"mode": "none"}
    assert data["sendCookiesWithRequests"] is False
    assert data["headers"] == {}


def test_put_config_upserts_and_replaces_headers(client: TestClient):
    first_payload = {
        "baseUrl": {
            "local": "http://localhost:3000",
            "production": "https://api.example.com",
            "staging": "https://staging.example.com"
        },
        "auth": {"mode": "none"},
        "headers": {
            "authToken": {"source": "localStorage", "key": "authorization"},
            "csrf": {"source": "cookies", "key": "csrfToken"}
        }
    }
    response = client.put("/config", json=first_payload, headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["baseUrl"]["staging"] == "https://staging.example.com"
    assert data["auth"] == {"mode": "none"}
    assert data["sendCookiesWithRequests"] is False
    assert set(data["headers"].keys()) == {"authToken", "csrf"}

    second_payload = {
        "baseUrl": {
            "local": "http://localhost:4000",
            "production": "https://api.example.com"
        },
        "auth": {"mode": "none"},
        "headers": {
            "session": {"source": "sessionStorage", "key": "sid"}
        }
    }
    response = client.put("/config", json=second_payload, headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert set(data["baseUrl"].keys()) == {"local", "production"}
    assert data["baseUrl"]["local"] == "http://localhost:4000"
    assert data["auth"] == {"mode": "none"}
    assert data["sendCookiesWithRequests"] is False
    assert data["headers"] == {"session": {"source": "sessionStorage", "key": "sid"}}

    response = client.get("/config", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "staging" not in data["baseUrl"]
    assert data["auth"] == {"mode": "none"}
    assert data["sendCookiesWithRequests"] is False
    assert data["headers"] == {"session": {"source": "sessionStorage", "key": "sid"}}


def test_put_config_requires_local_and_production(client: TestClient):
    payload = {
        "baseUrl": {"local": "http://localhost:3000"},
        "auth": {"mode": "none"},
        "headers": {}
    }
    response = client.put("/config", json=payload, headers=auth_headers())
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required environments: production"


def test_header_auth_round_trips_separately_from_headers(client: TestClient):
    payload = {
        "baseUrl": {
            "local": "http://localhost:3000",
            "production": "https://api.example.com"
        },
        "auth": {"mode": "header", "source": "localStorage", "key": "token"},
        "headers": {}
    }

    first = client.put("/config", json=payload, headers=auth_headers())
    assert first.status_code == 200
    assert first.json()["auth"] == {
        "mode": "header",
        "source": "localStorage",
        "key": "token",
        "authType": "bearer",
    }
    assert first.json()["sendCookiesWithRequests"] is False
    assert first.json()["headers"] == {}

    payload["auth"]["authType"] = "basic"
    second = client.put("/config", json=payload, headers=auth_headers())
    assert second.status_code == 200
    assert second.json()["auth"] == {
        "mode": "header",
        "source": "localStorage",
        "key": "token",
        "authType": "basic",
    }

def test_send_cookies_with_requests_round_trips_as_request_behavior(client: TestClient):
    payload = {
        "baseUrl": {
            "local": "http://localhost:3000",
            "production": "https://api.example.com"
        },
        "auth": {"mode": "none"},
        "sendCookiesWithRequests": True,
        "headers": {}
    }

    response = client.put("/config", json=payload, headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["auth"] == {"mode": "none"}
    assert response.json()["sendCookiesWithRequests"] is True
    assert response.json()["headers"] == {}


def test_header_auth_and_cookie_sending_can_both_round_trip(client: TestClient):
    payload = {
        "baseUrl": {
            "local": "http://localhost:3000",
            "production": "https://api.example.com"
        },
        "auth": {"mode": "header", "source": "localStorage", "key": "token"},
        "sendCookiesWithRequests": True,
        "headers": {}
    }

    response = client.put("/config", json=payload, headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["auth"] == {
        "mode": "header",
        "source": "localStorage",
        "key": "token",
        "authType": "bearer",
    }
    assert response.json()["sendCookiesWithRequests"] is True
    assert response.json()["headers"] == {}


def test_header_auth_requires_a_key_without_crashing_request_validation(client: TestClient):
    payload = {
        "baseUrl": {
            "local": "http://localhost:3000",
            "production": "https://api.example.com"
        },
        "auth": {"mode": "header", "source": "localStorage"},
        "headers": {}
    }

    response = client.put("/config", json=payload, headers=auth_headers())
    assert response.status_code == 422
    assert "Header auth key is required" in response.text


def test_legacy_authorization_header_payload_is_still_accepted(client: TestClient):
    payload = {
        "baseUrl": {
            "local": "http://localhost:3000",
            "production": "https://api.example.com"
        },
        "headers": {
            "Authorization": {"source": "cookies", "key": "legacy_cookie", "authType": "bearer"},
            "x-user-id": {"source": "cookies", "key": "user_id"}
        }
    }

    response = client.put("/config", json=payload, headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["auth"] == {
        "mode": "header",
        "source": "cookies",
        "key": "legacy_cookie",
        "authType": "bearer",
    }
    assert response.json()["sendCookiesWithRequests"] is False
    assert response.json()["headers"] == {"x-user-id": {"source": "cookies", "key": "user_id"}}


def test_legacy_authorization_cookie_payload_without_key_enables_request_credentials(client: TestClient):
    payload = {
        "baseUrl": {
            "local": "http://localhost:3000",
            "production": "https://api.example.com"
        },
        "headers": {
            "Authorization": {"source": "cookies"},
            "x-user-id": {"source": "cookies", "key": "user_id"}
        }
    }

    response = client.put("/config", json=payload, headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["auth"] == {"mode": "none"}
    assert response.json()["sendCookiesWithRequests"] is True
    assert response.json()["headers"] == {"x-user-id": {"source": "cookies", "key": "user_id"}}


def test_config_is_user_scoped(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    payload_user1 = {
        "baseUrl": {
            "local": "http://localhost:3000",
            "production": "https://api.example.com"
        },
        "auth": {"mode": "none"},
        "headers": {
            "authToken": {"source": "localStorage", "key": "authorization"}
        }
    }
    first_save = client.put("/config", json=payload_user1, headers=auth_headers())
    assert first_save.status_code == 200

    monkeypatch.setattr(
        "app.core.auth.verify_clerk_session",
        lambda token, forwarded_headers=None: ClerkSession(id="sess_2", user_id="user_2", status="active")
    )
    second_get = client.get("/config", headers=auth_headers())
    assert second_get.status_code == 200
    second_data = second_get.json()
    assert second_data["baseUrl"]["local"] == ""
    assert second_data["baseUrl"]["production"] == ""
    assert second_data["auth"] == {"mode": "none"}
    assert second_data["sendCookiesWithRequests"] is False
    assert second_data["headers"] == {}

    payload_user2 = {
        "baseUrl": {
            "local": "http://localhost:4000",
            "production": "https://api.user2.com"
        },
        "auth": {"mode": "none"},
        "headers": {
            "session": {"source": "sessionStorage", "key": "sid"}
        }
    }
    second_save = client.put("/config", json=payload_user2, headers=auth_headers())
    assert second_save.status_code == 200

    monkeypatch.setattr(
        "app.core.auth.verify_clerk_session",
        lambda token, forwarded_headers=None: ClerkSession(id="sess_1", user_id="user_1", status="active")
    )
    first_get = client.get("/config", headers=auth_headers())
    assert first_get.status_code == 200
    first_data = first_get.json()
    assert first_data["baseUrl"]["local"] == "http://localhost:3000"
    assert first_data["auth"] == {"mode": "none"}
    assert first_data["sendCookiesWithRequests"] is False
    assert first_data["headers"] == {"authToken": {"source": "localStorage", "key": "authorization"}}
