import importlib
from uuid import UUID

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
        yield
    finally:
        engine.dispose()


@pytest.fixture(autouse=True)
def stub_auth(monkeypatch: pytest.MonkeyPatch):
    session = ClerkSession(id="sess_1", user_id="user_1", status="active")
    monkeypatch.setattr("app.core.auth.verify_clerk_session", lambda token, forwarded_headers=None: session)
    return session


class FakeExecutor:
    def __init__(self, session, user_id, conversation_id=None, frontend_capability_enabled=True):
        self.calls = []

    async def run(self, message, history):
        self.calls.append({"message": message, "history": history})
        return "assistant reply"


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.controllers.agent.AgentExecutor", FakeExecutor)
    app = create_app()
    with TestClient(app) as client:
        yield client


def auth_headers():
    return {"Authorization": "Bearer token"}


def test_agent_conversation_and_chat_flow(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201
    agent = create.json()
    UUID(agent["id"])

    fetched = client.get("/agent", headers=auth_headers())
    assert fetched.status_code == 200
    assert fetched.json()["id"] == agent["id"]

    convo = client.post("/agent/conversations", json={"participant": "user"}, headers=auth_headers())
    assert convo.status_code == 201
    convo_id = convo.json()["id"]

    convo_get = client.get(f"/agent/conversations/{convo_id}", headers=auth_headers())
    assert convo_get.status_code == 200
    assert convo_get.json()["messages"] == []

    chat = client.post(f"/agent/conversations/{convo_id}", json={"message": "hi"}, headers=auth_headers())
    assert chat.status_code == 200
    body = chat.json()
    assert body["message"]["role"] == "user"
    assert body["response"]["role"] == "assistant"

    conversations = client.get("/agent/conversations", headers=auth_headers())
    assert conversations.status_code == 200
    assert len(conversations.json()) == 1


def test_agent_widget_config_get_and_update(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    fetched = client.get("/agent/widget-config", headers=auth_headers())
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["widgetTitle"] == "Warpy"
    assert body["widgetSubtitle"] == "Ready to act"
    assert body["widgetIconUrl"] is None
    assert body["widgetEmptyTitle"] == "What would you like to do?"
    assert body["widgetEmptyDescription"] == "Ask a question, request help, or describe what you want to get done."
    assert body["widgetInputPlaceholder"] == "Ask Warpy…"

    updated = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "Acme Assistant",
            "widgetSubtitle": "Here to help",
            "widgetIconUrl": "https://example.com/icon.png",
            "widgetEmptyTitle": "How can we help?",
            "widgetEmptyDescription": "Ask a question or request help.",
            "widgetInputPlaceholder": "Ask Acme…",
        },
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["widgetTitle"] == "Acme Assistant"
    assert updated_body["widgetIconUrl"] == "https://example.com/icon.png"

    refetched = client.get("/agent/widget-config", headers=auth_headers())
    assert refetched.status_code == 200
    assert refetched.json()["widgetTitle"] == "Acme Assistant"


def test_agent_widget_config_icon_url_validation(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    invalid = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "Acme Assistant",
            "widgetSubtitle": "Here to help",
            "widgetIconUrl": "not a url",
            "widgetEmptyTitle": "How can we help?",
            "widgetEmptyDescription": "Ask a question or request help.",
            "widgetInputPlaceholder": "Ask Acme…",
        },
    )
    assert invalid.status_code == 400


def test_agent_widget_config_rejects_blank_title(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    invalid = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "   ",
            "widgetSubtitle": "Here to help",
            "widgetIconUrl": None,
            "widgetEmptyTitle": "How can we help?",
            "widgetEmptyDescription": "Ask a question or request help.",
            "widgetInputPlaceholder": "Ask Acme…",
        },
    )
    assert invalid.status_code == 400


def test_agent_widget_install_preferences_get_and_update(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    fetched = client.get("/agent/widget-install", headers=auth_headers())
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["framework"] == "react"
    assert body["packageManager"] == "npm"

    updated = client.put(
        "/agent/widget-install",
        headers=auth_headers(),
        json={"framework": "vue", "packageManager": "pnpm"},
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["framework"] == "vue"
    assert updated_body["packageManager"] == "pnpm"

    refetched = client.get("/agent/widget-install", headers=auth_headers())
    assert refetched.status_code == 200
    refetched_body = refetched.json()
    assert refetched_body["framework"] == "vue"
    assert refetched_body["packageManager"] == "pnpm"


def test_agent_frontend_capability_get_and_update(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    fetched = client.get("/agent/frontend-capability", headers=auth_headers())
    assert fetched.status_code == 200
    assert fetched.json()["enabled"] is True

    updated = client.put(
        "/agent/frontend-capability",
        headers=auth_headers(),
        json={"enabled": False},
    )
    assert updated.status_code == 200
    assert updated.json()["enabled"] is False

    refetched = client.get("/agent/frontend-capability", headers=auth_headers())
    assert refetched.status_code == 200
    assert refetched.json()["enabled"] is False

    reenabled = client.put(
        "/agent/frontend-capability",
        headers=auth_headers(),
        json={"enabled": True},
    )
    assert reenabled.status_code == 200
    assert reenabled.json()["enabled"] is True
