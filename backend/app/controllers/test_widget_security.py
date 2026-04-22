import importlib
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.database import session_scope
from app.main import create_app
from app.models import Agent
from app.schemas.auth import ClerkSession
from app.services.api_key_service import hash_api_key
from app.services.agent_chain import StepResult


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch: pytest.MonkeyPatch):
    from app.core import database
    from app.core.config import get_settings

    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test")
    monkeypatch.setenv("WIDGET_JWT_SECRET", "secret")
    monkeypatch.setenv("API_KEY_ENCRYPTION_SECRET", "api-key-secret")
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

    async def run_step(
        self,
        user_message,
        conversation_history,
        tool_results=None,
        pending_messages=None,
        active_tool_ids=None,
        pending_input_items=None,
    ):
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


def reveal_api_key(client: TestClient) -> str:
    response = client.post("/api-key/reveal", headers=auth_headers())
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
    assert body["hasStagedChanges"] is False


def test_widget_security_deploy_enable_auto_creates_api_key(client: TestClient):
    create_agent(client)
    client.patch(
        "/agent/widget-security/draft",
        json={"requireSignedWidgetToken": True},
        headers=auth_headers(),
    )

    deployed = deploy_draft(client)
    assert deployed["active"]["requireSignedWidgetToken"] is True

    api_key = reveal_api_key(client)
    assert api_key.startswith("wrk_")


def test_widget_token_mints_for_deployed_key(client: TestClient):
    create_agent(client)
    api_key = reveal_api_key(client)

    token_res = client.post("/widget-token", headers={"Authorization": f"Bearer {api_key}"})
    assert token_res.status_code == 200
    assert "token" in token_res.json()


def test_widget_token_accepts_legacy_agent_widget_key(client: TestClient):
    agent_id = create_agent(client)
    legacy_key = "wrk_legacy_widget_key_1234"

    with session_scope() as session:
        agent = session.scalar(select(Agent).where(Agent.id == UUID(agent_id)))
        assert agent is not None
        agent.widget_api_key_hash = hash_api_key(legacy_key)
        agent.widget_api_key_last4 = legacy_key[-4:]
        session.flush()

    token_res = client.post("/widget-token", headers={"Authorization": f"Bearer {legacy_key}"})
    assert token_res.status_code == 200
    assert "token" in token_res.json()


def test_widget_auth_required_when_enabled(client: TestClient):
    agent_id = create_agent(client)
    api_key = reveal_api_key(client)
    client.patch(
        "/agent/widget-security/draft",
        json={"requireSignedWidgetToken": True},
        headers=auth_headers(),
    )
    deploy_draft(client)

    with client.websocket_connect("/widget/session") as websocket:
        websocket.send_json(
            {
                "type": "chat.request",
                "request": {"agentId": agent_id, "requestId": "req_security_unauthorized", "message": "hello"},
            }
        )
        unauthorized = websocket.receive_json()

    assert unauthorized == {
        "type": "chat.error",
        "error": {
            "code": "WIDGET_AUTH_REQUIRED",
            "message": "Signed widget token required",
            "retriable": False,
        },
    }

    token_res = client.post("/widget-token", headers={"Authorization": f"Bearer {api_key}"})
    token = token_res.json()["token"]
    with client.websocket_connect("/widget/session") as websocket:
        websocket.send_json(
            {
                "type": "chat.request",
                "widgetToken": token,
                "request": {"agentId": agent_id, "requestId": "req_security_authorized", "message": "hello"},
            }
        )
        authorized = websocket.receive_json()

    assert authorized["type"] == "chat.response"
    assert authorized["response"]["done"] is True


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
    api_key = reveal_api_key(client)

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
