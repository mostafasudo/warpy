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
    def __init__(self, session, user_id):
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
