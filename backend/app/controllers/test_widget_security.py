import importlib

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.auth import ClerkSession
from app.services.agent_chain import StepResult


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch: pytest.MonkeyPatch):
    from app.core import database
    from app.core.config import get_settings

    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test")
    monkeypatch.setenv("WIDGET_JWT_SECRET", "secret")
    monkeypatch.setenv("TEST_WIDGET_TOKEN_API_KEY", "")
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


class FakeExecutor:
    def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
        self.responses = []

    async def run_step(self, user_message, conversation_history, tool_results=None, pending_messages=None, active_tool_ids=None):
        if self.responses:
            return self.responses.pop(0)
        return StepResult(response="done", done=True, messages=[], active_tool_ids=[])


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutor)
    monkeypatch.setattr("app.controllers.widget.get_redis_connection", lambda: None)
    app = create_app()
    with TestClient(app) as client:
        yield client


def auth_headers():
    return {"Authorization": "Bearer token"}


def create_agent(client: TestClient) -> str:
    response = client.post("/agent", headers=auth_headers())
    assert response.status_code == 201
    return response.json()["id"]


def generate_key_draft(client: TestClient) -> str:
    response = client.post("/agent/widget-security/api-key", headers=auth_headers())
    assert response.status_code == 200
    return response.json()["apiKey"]


def deploy_draft(client: TestClient):
    response = client.post("/agent/widget-security/deploy", headers=auth_headers())
    assert response.status_code == 200
    return response.json()


def test_widget_security_initial_state(client: TestClient):
    create_agent(client)
    response = client.get("/agent/widget-security", headers=auth_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["active"]["requireSignedWidgetToken"] is False
    assert body["active"]["widgetRefreshEndpointPath"] == "/widget-token"
    assert body["active"]["hasApiKey"] is False
    assert body["hasStagedChanges"] is False


def test_widget_security_key_draft_and_deploy(client: TestClient):
    create_agent(client)
    api_key = generate_key_draft(client)
    assert api_key

    draft_state = client.get("/agent/widget-security", headers=auth_headers()).json()
    assert draft_state["hasStagedChanges"] is True
    assert draft_state["draft"]["apiKeyLast4"] is not None

    deployed = deploy_draft(client)
    assert deployed["hasStagedChanges"] is False
    assert deployed["active"]["hasApiKey"] is True
    assert deployed["active"]["apiKeyLast4"] is not None


def test_widget_security_deploy_enable_requires_key(client: TestClient):
    create_agent(client)
    response = client.patch(
        "/agent/widget-security/draft",
        json={"requireSignedWidgetToken": True},
        headers=auth_headers(),
    )
    assert response.status_code == 200
    deploy = client.post("/agent/widget-security/deploy", headers=auth_headers())
    assert deploy.status_code == 400


def test_widget_token_mints_for_deployed_key(client: TestClient):
    create_agent(client)
    api_key = generate_key_draft(client)
    deploy_draft(client)

    token_res = client.post("/widget-token", headers={"Authorization": f"Bearer {api_key}"})
    assert token_res.status_code == 200
    assert "token" in token_res.json()


def test_widget_auth_required_when_enabled(client: TestClient):
    agent_id = create_agent(client)
    api_key = generate_key_draft(client)
    client.patch(
        "/agent/widget-security/draft",
        json={"requireSignedWidgetToken": True},
        headers=auth_headers(),
    )
    deploy_draft(client)

    unauthorized = client.post("/widget/chat", json={"agentId": agent_id, "message": "hello"})
    assert unauthorized.status_code == 401
    assert unauthorized.json()["detail"]["code"] == "WIDGET_AUTH_REQUIRED"

    token_res = client.post("/widget-token", headers={"Authorization": f"Bearer {api_key}"})
    token = token_res.json()["token"]
    authorized = client.post(
        "/widget/chat",
        json={"agentId": agent_id, "message": "hello"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert authorized.status_code == 200
    assert authorized.json()["done"] is True


def test_widget_security_refresh_endpoint_validation(client: TestClient):
    create_agent(client)
    invalid = client.patch(
        "/agent/widget-security/draft",
        json={"widgetRefreshEndpointPath": "widget-token"},
        headers=auth_headers(),
    )
    assert invalid.status_code == 400


def test_widget_security_refresh_endpoint_staging_and_deploy(client: TestClient):
    create_agent(client)
    staged = client.patch(
        "/agent/widget-security/draft",
        json={"widgetRefreshEndpointPath": "/custom-token"},
        headers=auth_headers(),
    )
    assert staged.status_code == 200
    assert staged.json()["hasStagedChanges"] is True
    assert staged.json()["draft"]["widgetRefreshEndpointPath"] == "/custom-token"

    deployed = deploy_draft(client)
    assert deployed["active"]["widgetRefreshEndpointPath"] == "/custom-token"


def test_widget_security_discard_clears_draft(client: TestClient):
    create_agent(client)
    client.patch(
        "/agent/widget-security/draft",
        json={"requireSignedWidgetToken": True},
        headers=auth_headers(),
    )
    staged = client.get("/agent/widget-security", headers=auth_headers()).json()
    assert staged["hasStagedChanges"] is True

    discarded = client.post("/agent/widget-security/discard", headers=auth_headers())
    assert discarded.status_code == 200
    body = discarded.json()
    assert body["hasStagedChanges"] is False
    assert body["draft"] is None
    assert body["active"]["requireSignedWidgetToken"] is False


def test_test_widget_token_endpoint_requires_env_var(client: TestClient):
    response = client.post("/test-widget-token")
    assert response.status_code == 503


def test_test_widget_token_endpoint_proxies_widget_token(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings

    create_agent(client)
    api_key = generate_key_draft(client)
    deploy_draft(client)

    monkeypatch.setenv("TEST_WIDGET_TOKEN_API_KEY", api_key)
    get_settings.cache_clear()

    response = client.post("/test-widget-token")
    assert response.status_code == 200
    assert "token" in response.json()


def test_test_widget_token_endpoint_disabled_in_production(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings

    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()

    response = client.post("/test-widget-token")
    assert response.status_code == 404
