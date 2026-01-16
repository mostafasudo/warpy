import importlib
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.llm_config import LLMConfig
from app.main import create_app
from app.models import BillingAccount
from app.schemas.auth import ClerkSession
from app.services.agent_chain import StepResult
from app.services.billing_service import get_or_create_billing_account


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
    def __init__(self, session, user_id, conversation_id=None, redis_client=None):
        self.calls = []
        self.responses = []

    async def run_step(self, user_message, conversation_history, tool_results=None, pending_messages=None, active_endpoint_ids=None):
        self.calls.append({
            "user_message": user_message,
            "history": conversation_history,
            "tool_results": tool_results
        })
        if self.responses:
            return self.responses.pop(0)
        return StepResult(response="done", done=True, messages=[], active_endpoint_ids=[])


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutor)
    monkeypatch.setattr("app.controllers.widget.get_redis_connection", lambda: None)
    app = create_app()
    with TestClient(app) as client:
        yield client


def auth_headers():
    return {"Authorization": "Bearer token"}


def test_widget_config_not_found(client: TestClient):
    response = client.get(f"/widget/config/{uuid4()}")
    assert response.status_code == 404


def test_widget_config_returns_headers(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    assert agent.status_code == 201
    agent_id = agent.json()["id"]

    config = client.get(f"/widget/config/{agent_id}")
    assert config.status_code == 200
    body = config.json()
    assert "headers" in body
    assert body["isWidgetHidden"] is False
    assert body["actionsRemaining"] == 500
    assert body["widgetTitle"] == "Warpy"
    assert body["widgetSubtitle"] == "Ready to act"
    assert body["widgetIconUrl"] is None
    assert body["widgetEmptyTitle"] == "What would you like to do?"
    assert body["widgetEmptyDescription"] == "Ask a question, request help, or describe what you want to get done."
    assert body["widgetInputPlaceholder"] == "Ask Warpy…"
    assert body["widgetStyles"] is None


def test_widget_hides_when_actions_exhausted(client: TestClient):
    from app.core.database import session_scope

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with session_scope() as session:
        account = session.get(BillingAccount, "user_1")
        if not account:
            account = get_or_create_billing_account(session, "user_1")
        account.lifetime_actions_remaining = 0
        account.topup_actions_remaining = 0
        account.monthly_actions_remaining = 0

    config = client.get(f"/widget/config/{agent_id}")
    assert config.status_code == 200
    assert config.json()["isWidgetHidden"] is True
    assert config.json()["actionsRemaining"] == 0

    response = client.post("/widget/chat", json={"agentId": agent_id, "message": "hello"})
    assert response.status_code == 200
    assert response.json()["isWidgetHidden"] is True
    assert response.json()["done"] is True


def test_widget_hides_after_consuming_last_action_on_tool_result(client: TestClient):
    from app.core.database import session_scope

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with session_scope() as session:
        account = session.get(BillingAccount, "user_1")
        if not account:
            account = get_or_create_billing_account(session, "user_1")
        account.lifetime_actions_remaining = 1
        account.topup_actions_remaining = 0
        account.monthly_actions_remaining = 0

    first = client.post("/widget/chat", json={"agentId": agent_id, "message": "start"})
    convo_id = first.json()["conversationId"]

    second = client.post("/widget/chat", json={
        "agentId": agent_id,
        "conversationId": convo_id,
        "toolResults": [{"id": "tc_1", "statusCode": 200, "body": {"ok": True}}]
    })
    assert second.status_code == 200
    assert second.json()["isWidgetHidden"] is True
    assert second.json()["actionsRemaining"] == 0


def test_widget_chat_agent_not_found(client: TestClient):
    response = client.post("/widget/chat", json={
        "agentId": str(uuid4()),
        "message": "hello"
    })
    assert response.status_code == 404


def test_widget_chat_creates_conversation(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    response = client.post("/widget/chat", json={
        "agentId": agent_id,
        "message": "hello"
    })
    assert response.status_code == 200
    body = response.json()
    assert "conversationId" in body
    UUID(body["conversationId"])
    assert body["done"] is True


def test_widget_chat_uses_existing_conversation(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    first = client.post("/widget/chat", json={
        "agentId": agent_id,
        "message": "first"
    })
    convo_id = first.json()["conversationId"]

    second = client.post("/widget/chat", json={
        "agentId": agent_id,
        "conversationId": convo_id,
        "message": "second"
    })
    assert second.status_code == 200
    assert second.json()["conversationId"] == convo_id


def test_widget_chat_conversation_not_found(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    response = client.post("/widget/chat", json={
        "agentId": agent_id,
        "conversationId": str(uuid4()),
        "message": "hello"
    })
    assert response.status_code == 404


def test_widget_chat_returns_tool_calls(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.schemas.widget import ToolCallPayload

    tool_call = ToolCallPayload(
        id="tc_1",
        endpointId=uuid4(),
        name="get_user",
        method="GET",
        path="/users/{id}",
        params={"id": "123"},
        query={},
        body={},
        headers={}
    )

    class FakeExecutorWithTools:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None):
            pass

        async def run_step(self, user_message, conversation_history, tool_results=None, pending_messages=None, active_endpoint_ids=None):
            if tool_results:
                return StepResult(response="done with tools", done=True, messages=[], active_endpoint_ids=[])
            return StepResult(tool_calls=[tool_call], done=False, messages=[], active_endpoint_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorWithTools)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    response = client.post("/widget/chat", json={
        "agentId": agent_id,
        "message": "get user 123"
    })
    assert response.status_code == 200
    body = response.json()
    assert body["done"] is False
    assert len(body["toolCalls"]) == 1
    assert body["toolCalls"][0]["name"] == "get_user"


def test_widget_chat_accepts_tool_results(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    call_count = {"count": 0}

    class FakeExecutorWithToolResults:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None):
            pass

        async def run_step(self, user_message, conversation_history, tool_results=None, pending_messages=None, active_endpoint_ids=None):
            call_count["count"] += 1
            if tool_results:
                assert len(tool_results) == 1
                assert tool_results[0].id == "tc_1"
                assert tool_results[0].status_code == 200
                return StepResult(response="result processed", done=True, messages=[], active_endpoint_ids=[])
            return StepResult(response="no tools", done=True, messages=[], active_endpoint_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorWithToolResults)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    first = client.post("/widget/chat", json={
        "agentId": agent_id,
        "message": "start"
    })
    convo_id = first.json()["conversationId"]

    response = client.post("/widget/chat", json={
        "agentId": agent_id,
        "conversationId": convo_id,
        "toolResults": [
            {"id": "tc_1", "statusCode": 200, "body": {"user": "test"}}
        ]
    })
    assert response.status_code == 200
    assert response.json()["done"] is True


def test_widget_transcribe_success(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    async def fake_transcribe(data, filename):
        return "spoken text"

    monkeypatch.setattr("app.controllers.widget.transcribe_audio", fake_transcribe)

    response = client.post(
        f"/widget/transcribe?agentId={agent_id}",
        content=b"123",
        headers={"Content-Type": "audio/webm", "x-audio-filename": "audio.webm"}
    )
    assert response.status_code == 200
    assert response.json()["text"] == "spoken text"


def test_widget_transcribe_agent_not_found(client: TestClient):
    response = client.post(
        f"/widget/transcribe?agentId={uuid4()}",
        content=b"123",
        headers={"Content-Type": "audio/webm"}
    )
    assert response.status_code == 404


def test_widget_transcribe_empty_audio(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    response = client.post(
        f"/widget/transcribe?agentId={agent_id}",
        content=b"",
        headers={"Content-Type": "audio/webm"}
    )
    assert response.status_code == 400


def test_widget_transcribe_invalid_content_type(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    response = client.post(
        f"/widget/transcribe?agentId={agent_id}",
        content=b"123",
        headers={"Content-Type": "text/plain"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid content type"


def test_widget_transcribe_sanitizes_filename(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    captured = {"name": None}

    async def fake_transcribe(data, filename):
        captured["name"] = filename
        return "ok"

    monkeypatch.setattr("app.controllers.widget.transcribe_audio", fake_transcribe)

    response = client.post(
        f"/widget/transcribe?agentId={agent_id}",
        content=b"123",
        headers={"Content-Type": "audio/webm", "x-audio-filename": "..\\path/voice.webm"}
    )
    assert response.status_code == 200
    assert captured["name"] == "voice.webm"


def test_widget_transcribe_rejects_large_audio(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    monkeypatch.setattr("app.controllers.widget.llm_config", LLMConfig(max_audio_bytes=2))

    response = client.post(
        f"/widget/transcribe?agentId={agent_id}",
        content=b"1234",
        headers={"Content-Type": "audio/webm"}
    )
    assert response.status_code == 413


def test_widget_transcribe_stream_limit(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    monkeypatch.setattr("app.controllers.widget.llm_config", LLMConfig(max_audio_bytes=4))

    called = {"count": 0}

    async def fake_transcribe(data, filename):
        called["count"] += 1
        return "ok"

    monkeypatch.setattr("app.controllers.widget.transcribe_audio", fake_transcribe)

    def stream():
        yield b"aaa"
        yield b"bbb"

    response = client.post(
        f"/widget/transcribe?agentId={agent_id}",
        content=stream(),
        headers={"Content-Type": "audio/webm"}
    )
    assert response.status_code == 413
    assert called["count"] == 0
