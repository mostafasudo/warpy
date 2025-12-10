import importlib

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.auth import ClerkSession


@pytest.fixture
def configure_settings(monkeypatch: pytest.MonkeyPatch):
    from app.core import database
    from app.core.config import get_settings

    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test")
    get_settings.cache_clear()
    importlib.reload(database)
    from app.models import Base

    engine = database.get_engine()
    Base.metadata.create_all(engine)
    try:
        monkeypatch.setattr("app.services.endpoint_service.enqueue_endpoint_embedding", lambda *_args, **_kwargs: None)
        monkeypatch.setattr("app.services.feature_service.enqueue_endpoint_embedding", lambda *_args, **_kwargs: None)
        yield get_settings()
    finally:
        Base.metadata.drop_all(engine)
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


def build_tool(name: str, description: str):
    return {
        "type": "function",
        "function": {"name": name, "description": description, "parameters": {"type": "object", "properties": {}}}
    }


def test_feature_crud_and_toggle(configure_settings, client: TestClient):
    create_feature = client.post("/features", json={"name": "Users"}, headers=auth_headers())
    assert create_feature.status_code == 201
    feature_id = create_feature.json()["id"]

    endpoint_payload = {
        "path": "/users/{id}",
        "method": "GET",
        "tool": build_tool("getUser", "Fetch user"),
        "feature": {"mode": "existing", "id": feature_id},
        "agentEnabled": True
    }
    create_endpoint = client.post("/endpoints", json=endpoint_payload, headers=auth_headers())
    assert create_endpoint.status_code == 201

    features_response = client.get("/features", headers=auth_headers())
    assert features_response.status_code == 200
    data = features_response.json()
    assert data[0]["endpointCount"] == 1
    assert data[0]["endpoints"][0]["feature"]["id"] == feature_id

    toggle = client.post(f"/features/{feature_id}/enabled", json={"agentEnabled": False}, headers=auth_headers())
    assert toggle.status_code == 200
    assert toggle.json()["enabledState"] in ["disabled", "partial"]

    delete_endpoint = client.delete(f"/endpoints/{create_endpoint.json()['id']}", headers=auth_headers())
    assert delete_endpoint.status_code == 204

    after_delete = client.get("/features", headers=auth_headers())
    assert after_delete.status_code == 200
    data_after = after_delete.json()
    assert len(data_after) == 1
    assert data_after[0]["endpointCount"] == 0
