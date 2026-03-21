import importlib
import asyncio
import time
from threading import Event
from contextlib import contextmanager
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import HumanMessage
from sqlalchemy import func, select
from starlette.websockets import WebSocketDisconnect

from app.controllers.widget import build_widget_agent_runtime
from app.core.llm_config import LLMConfig
from app.main import create_app
from app.models import Agent, BillingAccount, BillingActionConsumption, Conversation, ConversationAction, DocumentStatus, KnowledgeDocument, Message
from app.schemas.auth import ClerkSession
from app.services.agent_chain import StepResult
from app.services.billing_service import get_or_create_billing_account

EMPTY_V2_TOOL_CONTEXT = '{"version": 2, "format": "responses_input_items", "input_items": []}'


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
    def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
        self.calls = []
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
        self.calls.append({
            "user_message": user_message,
            "history": conversation_history,
            "tool_results": tool_results
        })
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


def send_widget_request(websocket, request: dict, *, widget_token: str | None = None) -> dict:
    request_payload = dict(request)
    last_request_id = getattr(websocket, "_warpy_request_id", None)
    request_id = request_payload.get("requestId") or last_request_id or f"req_{uuid4()}"
    request_payload["requestId"] = request_id
    setattr(websocket, "_warpy_request_id", request_id)
    payload = {"type": "chat.request", "request": request_payload}
    if widget_token:
        payload["widgetToken"] = widget_token
    websocket.send_json(payload)
    return websocket.receive_json()


def _conversation_messages(conversation_id: UUID) -> list[tuple[str, str]]:
    from app.core.database import session_scope

    with session_scope() as session:
        return list(session.execute(
            select(Message.role, Message.content)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.sequence, Message.created_at, Message.id)
        ).all())


def _conversation_id_for_agent(agent_id: str) -> UUID:
    from app.core.database import session_scope

    with session_scope() as session:
        conversation = session.scalar(
            select(Conversation)
            .where(Conversation.agent_id == UUID(agent_id))
            .order_by(Conversation.created_at.desc())
        )
        assert conversation is not None
        return conversation.id


def _wait_for(predicate, timeout: float = 1.5) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    assert predicate()


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
    assert body["actionsRemaining"] == 50
    assert body["widgetTitle"] == "Warpy"
    assert body["widgetIconUrl"] is None
    assert body["widgetBehavior"] == "overlay"
    assert body["widgetEmptyTitle"] == "What would you like to do?"
    assert body["widgetEmptyDescription"] == "Ask a question, request help, or describe what you want to get done."
    assert body["widgetInputPlaceholder"] == "Ask Warpy…"
    assert body["widgetSuggestionsEnabled"] is False
    assert body["widgetStarterSuggestions"] == []


def test_build_widget_agent_runtime_hides_knowledge_base_without_searchable_sources():
    from app.core.database import session_scope

    with session_scope() as session:
        agent = Agent(user_id="user_1", knowledge_base_enabled=True)
        session.add(agent)
        session.flush()

        runtime = build_widget_agent_runtime(session, agent)

    assert runtime.executor_config["knowledge_base_enabled"] is False


def test_build_widget_agent_runtime_enables_knowledge_base_when_searchable_source_exists():
    from app.core.database import session_scope

    with session_scope() as session:
        agent = Agent(user_id="user_1", knowledge_base_enabled=True)
        session.add(agent)
        session.flush()
        session.add(
            KnowledgeDocument(
                user_id="user_1",
                file_name="guide.md",
                file_type=".md",
                file_size=32,
                source_kind="file",
                status=DocumentStatus.ready,
                chunk_count=1,
                is_searchable=True,
            )
        )
        session.flush()

        runtime = build_widget_agent_runtime(session, agent)

    assert runtime.executor_config["knowledge_base_enabled"] is True


def test_widget_session_returns_dynamic_suggestions(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    class FakeExecutorWithSuggestions:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            return StepResult(
                response="Here is the summary.",
                suggestions=["Create another invoice", "Show unpaid invoices"],
                done=True,
                messages=[],
                active_tool_ids=[],
            )

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorWithSuggestions)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    update = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "Warpy",
            "widgetIconUrl": None,
            "widgetBehavior": "overlay",
            "widgetEmptyTitle": "What would you like to do?",
            "widgetEmptyDescription": "Ask a question, request help, or describe what you want to get done.",
            "widgetInputPlaceholder": "Ask Warpy…",
            "widgetSuggestionsEnabled": True,
            "widgetStarterSuggestions": ["Show unpaid invoices"],
            "widgetSecurityDisclosureEnabled": True,
        },
    )
    assert update.status_code == 200

    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(
            websocket,
            {"agentId": agent_id, "message": "Help me with invoices"},
        )

    assert response["type"] == "chat.response"
    assert response["response"]["suggestions"] == ["Create another invoice", "Show unpaid invoices"]


def test_widget_session_creates_langsmith_trace(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    traces = []

    class FakeTrace:
        def __init__(self, name, run_type="chain", **kwargs):
            self.name = name
            self.run_type = run_type
            self.kwargs = kwargs
            self.outputs = None
            self.error = None
            traces.append(self)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        def end(self, *, outputs=None, error=None):
            self.outputs = outputs
            self.error = error

    monkeypatch.setattr("app.controllers.widget.langsmith_trace", lambda *args, **kwargs: FakeTrace(*args, **kwargs))
    monkeypatch.setattr(
        "app.controllers.widget.get_settings",
        lambda: type("Settings", (), {"openai_api_key": "", "langsmith_tracing": True})(),
    )

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(
            websocket,
            {"agentId": agent_id, "message": "Help me create a feature"},
        )

    assert response["type"] == "chat.response"
    assert len(traces) == 1
    trace = traces[0]
    assert trace.name == "widget-session"
    assert trace.run_type == "chain"
    assert trace.kwargs["tags"] == ["widget-session"]
    assert trace.kwargs["inputs"]["message"] == "Help me create a feature"
    assert trace.outputs["status"] == "completed"
    assert trace.outputs["tool_call_count"] == 0
    assert trace.error is None


def test_widget_session_hides_when_actions_exhausted(client: TestClient):
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

    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(websocket, {"agentId": agent_id, "message": "hello"})

    assert response["type"] == "chat.response"
    assert response["response"]["isWidgetHidden"] is True
    assert response["response"]["done"] is True


def test_widget_session_hidden_request_replays_without_polluting_future_history(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    from app.core.database import session_scope
    from app.core.user_messages import ASSISTANT_UNAVAILABLE_MESSAGE

    executor_calls: list[dict[str, object]] = []

    class FakeExecutorHistory:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            executor_calls.append({"user_message": user_message, "history": conversation_history})
            return StepResult(response="allowed response", done=True, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorHistory)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with session_scope() as session:
        account = session.get(BillingAccount, "user_1")
        if not account:
            account = get_or_create_billing_account(session, "user_1")
        account.lifetime_actions_remaining = 0
        account.topup_actions_remaining = 0
        account.monthly_actions_remaining = 0

    with client.websocket_connect("/widget/session") as websocket:
        blocked = send_widget_request(
            websocket,
            {"agentId": agent_id, "requestId": "req_hidden", "message": "blocked prompt"},
        )

    conversation_id = blocked["response"]["conversationId"]
    assert blocked["type"] == "chat.response"
    assert blocked["response"]["done"] is True
    assert blocked["response"]["isWidgetHidden"] is True
    assert blocked["response"]["messages"] == [{"role": "assistant", "content": ASSISTANT_UNAVAILABLE_MESSAGE}]
    assert executor_calls == []
    assert _conversation_messages(UUID(conversation_id)) == [("assistant_hidden", ASSISTANT_UNAVAILABLE_MESSAGE)]

    with session_scope() as session:
        account = session.get(BillingAccount, "user_1")
        assert account is not None
        account.lifetime_actions_remaining = 1
        account.topup_actions_remaining = 0
        account.monthly_actions_remaining = 0

    with client.websocket_connect("/widget/session") as websocket:
        replay = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": conversation_id,
                "requestId": "req_hidden",
                "message": "blocked prompt",
            },
        )

    assert replay["type"] == "chat.response"
    assert replay["response"]["done"] is True
    assert replay["response"]["isWidgetHidden"] is True
    assert replay["response"]["messages"] == [{"role": "assistant", "content": ASSISTANT_UNAVAILABLE_MESSAGE}]
    assert executor_calls == []

    with client.websocket_connect("/widget/session") as websocket:
        allowed = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": conversation_id,
                "message": "allowed prompt",
            },
        )

    assert allowed["type"] == "chat.response"
    assert allowed["response"]["messages"] == [{"role": "assistant", "content": "allowed response"}]
    assert executor_calls == [{"user_message": "allowed prompt", "history": []}]
    assert _conversation_messages(UUID(conversation_id)) == [
        ("assistant_hidden", ASSISTANT_UNAVAILABLE_MESSAGE),
        ("user", "allowed prompt"),
        ("assistant", "allowed response"),
        ("tool_context", EMPTY_V2_TOOL_CONTEXT),
    ]


def test_widget_session_hides_after_consuming_last_action_on_tool_result(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope
    from app.schemas.widget import ToolCallPayload

    tool_call = ToolCallPayload(
        id="tc_1",
        tool_id=uuid4(),
        name="get_item",
        tool_type="backend",
        method="GET",
        path="/items/{id}",
        params={"id": "1"},
        query={},
        body={},
        headers={}
    )

    class FakeExecutorWithToolCalls:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            if tool_results:
                return StepResult(response="done", done=True, messages=[], active_tool_ids=[])
            return StepResult(tool_calls=[tool_call], done=False, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorWithToolCalls)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with session_scope() as session:
        account = session.get(BillingAccount, "user_1")
        if not account:
            account = get_or_create_billing_account(session, "user_1")
        account.lifetime_actions_remaining = 1
        account.topup_actions_remaining = 0
        account.monthly_actions_remaining = 0

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(websocket, {"agentId": agent_id, "message": "start"})
        convo_id = first["response"]["conversationId"]
        assert first["response"]["done"] is False
        assert len(first["response"]["toolCalls"]) == 1

        second = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": convo_id,
                "toolResults": [{"id": "tc_1", "statusCode": 200, "body": {"ok": True}}],
            },
        )

    assert second["type"] == "chat.response"
    assert second["response"]["isWidgetHidden"] is True
    assert second["response"]["actionsRemaining"] == 0


def test_widget_session_js_exec_consumes_billing_action(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope
    from app.schemas.widget import ToolCallPayload

    tool_call = ToolCallPayload(
        id="tc_js",
        name="js_exec",
        tool_type="js_exec",
        jsCode="document.title",
    )

    class FakeExecutorWithJsExec:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            if tool_results:
                return StepResult(response="done", done=True, messages=[], active_tool_ids=[])
            return StepResult(tool_calls=[tool_call], done=False, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorWithJsExec)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with session_scope() as session:
        account = session.get(BillingAccount, "user_1")
        if not account:
            account = get_or_create_billing_account(session, "user_1")
        account.lifetime_actions_remaining = 1
        account.topup_actions_remaining = 0
        account.monthly_actions_remaining = 0

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(websocket, {"agentId": agent_id, "message": "exec js"})
        convo_id = first["response"]["conversationId"]
        assert first["response"]["done"] is False
        assert len(first["response"]["toolCalls"]) == 1

        second = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": convo_id,
                "toolResults": [{"id": "tc_js", "statusCode": 200, "body": {"result": "My Page"}}],
            },
        )

    assert second["type"] == "chat.response"
    assert second["response"]["isWidgetHidden"] is True
    assert second["response"]["actionsRemaining"] == 0


def test_widget_session_rechecks_user_rate_limit_on_follow_up_requests(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.schemas.widget import ToolCallPayload

    tool_call = ToolCallPayload(
        id="tc_1",
        tool_id=uuid4(),
        name="get_item",
        tool_type="backend",
        method="GET",
        path="/items/{id}",
        params={"id": "1"},
        query={},
        body={},
        headers={},
    )

    class FakeExecutorWithToolCall:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            if tool_results:
                pytest.fail("tool_results should not be processed after rate limiting")
            return StepResult(tool_calls=[tool_call], done=False, messages=[], active_tool_ids=[])

    rate_limit_checks = {"count": 0}

    def fake_is_rate_limited(*_args, **_kwargs):
        rate_limit_checks["count"] += 1
        return rate_limit_checks["count"] >= 2

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorWithToolCall)
    monkeypatch.setattr("app.controllers.widget.get_redis_connection", lambda: object())
    monkeypatch.setattr("app.controllers.widget.is_rate_limited", fake_is_rate_limited)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    update = client.put(
        "/agent/user-rate-limits",
        headers=auth_headers(),
        json={"enabled": True, "dailyLimit": 1, "monthlyLimit": None},
    )
    assert update.status_code == 200

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(websocket, {"agentId": agent_id, "message": "start"})
        convo_id = first["response"]["conversationId"]
        second = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": convo_id,
                "toolResults": [{"id": "tc_1", "statusCode": 200, "body": {"ok": True}}],
            },
        )

    assert first["type"] == "chat.response"
    assert first["response"]["done"] is False
    assert second == {
        "type": "chat.error",
        "error": {
            "code": "RATE_LIMITED",
            "message": "You've reached your usage limit. Please try again later.",
            "retriable": False,
        },
    }


def test_widget_session_caps_follow_up_tool_iterations(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.schemas.widget import ToolCallPayload

    tool_call = ToolCallPayload(
        id="tc_1",
        tool_id=uuid4(),
        name="get_item",
        tool_type="backend",
        method="GET",
        path="/items/{id}",
        params={"id": "1"},
        query={},
        body={},
        headers={},
    )

    class FakeLoopingExecutor:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            return StepResult(tool_calls=[tool_call], done=False, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeLoopingExecutor)
    monkeypatch.setattr("app.controllers.widget.MAX_WIDGET_TOOL_ITERATIONS", 1)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(websocket, {"agentId": agent_id, "message": "start"})
        convo_id = first["response"]["conversationId"]
        second = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": convo_id,
                "toolResults": [{"id": "tc_1", "statusCode": 200, "body": {"ok": True}}],
            },
        )

    assert first["type"] == "chat.response"
    assert first["response"]["done"] is False
    assert second == {
        "type": "chat.error",
        "error": {
            "code": "MAX_TOOL_ITERATIONS_EXCEEDED",
            "message": "Widget session exceeded the maximum number of tool iterations",
            "retriable": False,
        },
    }


def test_widget_session_tool_results_skip_consumption_when_flag_false(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope
    from app.schemas.widget import ToolCallPayload

    tool_call = ToolCallPayload(
        id="tc_1",
        tool_id=uuid4(),
        name="get_item",
        tool_type="backend",
        method="GET",
        path="/items/{id}",
        params={"id": "1"},
        query={},
        body={},
        headers={}
    )

    class FakeExecutorWithToolCalls:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            if tool_results:
                return StepResult(response="done", done=True, messages=[], active_tool_ids=[])
            return StepResult(tool_calls=[tool_call], done=False, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorWithToolCalls)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with session_scope() as session:
        account = session.get(BillingAccount, "user_1")
        if not account:
            account = get_or_create_billing_account(session, "user_1")
        account.lifetime_actions_remaining = 1
        account.topup_actions_remaining = 0
        account.monthly_actions_remaining = 0

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(websocket, {"agentId": agent_id, "message": "start"})
        convo_id = first["response"]["conversationId"]
        assert first["response"]["done"] is False
        assert len(first["response"]["toolCalls"]) == 1

        second = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": convo_id,
                "toolResults": [{"id": "tc_1", "statusCode": 200, "consumeAction": False, "body": {"ok": True}}],
            },
        )

    assert second["type"] == "chat.response"
    assert second["response"]["isWidgetHidden"] is False
    assert second["response"]["actionsRemaining"] == 1


def test_widget_session_emits_agent_not_found(client: TestClient):
    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(
            websocket,
            {
                "agentId": str(uuid4()),
                "message": "hello",
            },
        )

    assert response == {
        "type": "chat.error",
        "error": {
            "code": "AGENT_NOT_FOUND",
            "message": "Agent not found",
            "retriable": False,
        },
    }


def test_widget_session_creates_conversation(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "message": "hello",
            },
        )

    assert response["type"] == "chat.response"
    body = response["response"]
    assert "conversationId" in body
    UUID(body["conversationId"])
    assert body["done"] is True


def test_widget_session_uses_short_lived_sessions_per_phase(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.controllers import widget as widget_mod
    from app.core.database import session_scope as real_session_scope

    class FakeExecutorDone:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            return StepResult(response="done", done=True, messages=[], active_tool_ids=[])

    session_entries = {"count": 0}

    @contextmanager
    def tracked_session_scope():
        session_entries["count"] += 1
        with real_session_scope() as session:
            yield session

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorDone)
    monkeypatch.setattr(widget_mod, "session_scope", tracked_session_scope)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "message": "hello",
            },
        )

    assert response["type"] == "chat.response"
    assert session_entries["count"] == 2


def test_widget_session_uses_existing_conversation(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(websocket, {"agentId": agent_id, "message": "first"})
    convo_id = first["response"]["conversationId"]

    with client.websocket_connect("/widget/session") as websocket:
        second = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": convo_id,
                "message": "second",
            },
        )

    assert second["type"] == "chat.response"
    assert second["response"]["conversationId"] == convo_id


def test_widget_session_emits_conversation_not_found(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": str(uuid4()),
                "message": "hello",
            },
        )

    assert response == {
        "type": "chat.error",
        "error": {
            "code": "CONVERSATION_NOT_FOUND",
            "message": "Conversation not found",
            "retriable": False,
        },
    }


def test_widget_session_handles_tool_calls_and_final_response(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope
    from app.schemas.widget import ToolCallPayload
    from app.services.widget_service import get_pending_state, get_tool_context

    tool_call = ToolCallPayload(
        id="tc_ws_1",
        tool_id=uuid4(),
        name="get_user",
        tool_type="backend",
        method="GET",
        path="/users/{id}",
        params={"id": "123"},
        query={},
        body={},
        headers={},
    )

    class FakeSocketExecutor:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            if tool_results:
                return StepResult(
                    response="done via websocket",
                    done=True,
                    messages=[],
                    responses_input_items=[
                        {"type": "compaction", "encrypted_content": "compact_1"},
                        {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "done via websocket"}]},
                    ],
                    active_tool_ids=[],
                )
            return StepResult(
                tool_calls=[tool_call],
                done=False,
                messages=[],
                responses_input_items=[
                    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "start"}]},
                    {"type": "function_call", "call_id": "tc_ws_1", "name": "get_user", "arguments": '{"id":"123"}'},
                ],
                active_tool_ids=[],
            )

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeSocketExecutor)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    request_id = "req_ws_first"

    with client.websocket_connect("/widget/session") as websocket:
        websocket.send_json(
            {
                "type": "chat.request",
                "request": {"agentId": agent_id, "requestId": request_id, "message": "start"},
            }
        )
        first = websocket.receive_json()
        assert first["type"] == "chat.response"
        assert first["response"]["done"] is False
        assert first["response"]["toolCalls"][0]["name"] == "get_user"

        conversation_id = first["response"]["conversationId"]
        with session_scope() as db_session:
            assert get_pending_state(db_session, UUID(conversation_id)) is not None

        websocket.send_json(
            {
                "type": "chat.request",
                "request": {
                    "agentId": agent_id,
                    "conversationId": conversation_id,
                    "requestId": request_id,
                    "toolResults": [{"id": "tc_ws_1", "statusCode": 200, "body": {"ok": True}}],
                },
            }
        )
        second = websocket.receive_json()
    assert second["type"] == "chat.response"
    assert second["response"]["done"] is True
    assert second["response"]["messages"] == [{"role": "assistant", "content": "done via websocket"}]

    with session_scope() as db_session:
        assert get_pending_state(db_session, UUID(conversation_id)) is None
        assert get_tool_context(db_session, UUID(conversation_id)) is not None


def test_widget_session_replays_completed_request_without_duplicate_persistence(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    call_count = {"value": 0}

    class FakeExecutorDoneOnce:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            call_count["value"] += 1
            return StepResult(response="done once", done=True, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorDoneOnce)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    request_id = "req_completed_once"

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(
            websocket,
            {"agentId": agent_id, "requestId": request_id, "message": "hello"},
        )

    conversation_id = UUID(first["response"]["conversationId"])
    with client.websocket_connect("/widget/session") as websocket:
        second = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "requestId": request_id,
                "message": "hello",
            },
        )

    assert first["response"]["requestId"] == request_id
    assert second["response"]["requestId"] == request_id
    assert second["response"]["conversationId"] == str(conversation_id)
    assert second["response"]["messages"] == [{"role": "assistant", "content": "done once"}]
    assert call_count["value"] == 1

    messages = _conversation_messages(conversation_id)
    assert messages == [
        ("user", "hello"),
        ("assistant", "done once"),
        ("tool_context", EMPTY_V2_TOOL_CONTEXT),
    ]


def test_widget_session_replays_completed_request_without_conversation_id_after_disconnect(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    call_count = {"value": 0}

    class FakeExecutorDoneOnce:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            call_count["value"] += 1
            return StepResult(response="done once", done=True, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorDoneOnce)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    request_id = "req_completed_disconnect"

    with client.websocket_connect("/widget/session") as websocket:
        websocket.send_json(
            {
                "type": "chat.request",
                "request": {"agentId": agent_id, "requestId": request_id, "message": "hello"},
            }
        )

    conversation_id = _conversation_id_for_agent(agent_id)
    _wait_for(lambda: any(role == "assistant" for role, _ in _conversation_messages(conversation_id)))

    with client.websocket_connect("/widget/session") as websocket:
        second = send_widget_request(
            websocket,
            {"agentId": agent_id, "requestId": request_id, "message": "hello"},
        )

    assert second["response"]["conversationId"] == str(conversation_id)
    assert second["response"]["messages"] == [{"role": "assistant", "content": "done once"}]
    assert call_count["value"] == 1

    from app.core.database import session_scope

    with session_scope() as session:
        conversation_count = session.scalar(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.agent_id == UUID(agent_id))
        )

    assert conversation_count == 1


def test_widget_session_rejects_request_conversation_mismatch(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(
            websocket,
            {"agentId": agent_id, "requestId": "req_mismatch", "message": "hello"},
        )

    with client.websocket_connect("/widget/session") as websocket:
        second = send_widget_request(
            websocket,
            {"agentId": agent_id, "requestId": "req_other", "message": "other"},
        )

    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": second["response"]["conversationId"],
                "requestId": "req_mismatch",
                "message": "hello",
            },
        )

    assert response == {
        "type": "chat.error",
        "error": {
            "code": "REQUEST_CONVERSATION_MISMATCH",
            "message": "Request id belongs to a different conversation",
            "retriable": False,
        },
    }

    assert second["response"]["conversationId"] != first["response"]["conversationId"]


def test_widget_session_rejects_request_payload_mismatch(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    request_id = "req_payload_mismatch"

    with client.websocket_connect("/widget/session") as websocket:
        send_widget_request(
            websocket,
            {"agentId": agent_id, "requestId": request_id, "message": "hello"},
        )

    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(
            websocket,
            {"agentId": agent_id, "requestId": request_id, "message": "goodbye"},
        )

    assert response == {
        "type": "chat.error",
        "error": {
            "code": "REQUEST_PAYLOAD_MISMATCH",
            "message": "Request id belongs to a different user message",
            "retriable": False,
        },
    }


def test_widget_session_requires_request_id(client: TestClient):
    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        websocket.send_json(
            {
                "type": "chat.request",
                "request": {"agentId": agent_id, "message": "hello"},
            }
        )
        response = websocket.receive_json()

    assert response == {
        "type": "chat.error",
        "error": {
            "code": "REQUEST_ID_REQUIRED",
            "message": "Request id is required",
            "retriable": False,
        },
    }


def test_widget_session_same_request_replay_drops_stale_in_flight_result(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    started = Event()
    release = Event()
    first_returned = Event()
    call_count = {"value": 0}

    class FakeExecutorReplay:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            call_count["value"] += 1
            if call_count["value"] == 1:
                started.set()
                assert await asyncio.to_thread(release.wait, 2)
                first_returned.set()
                return StepResult(response="stale response", done=True, messages=[], active_tool_ids=[])
            return StepResult(response="fresh response", done=True, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorReplay)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    request_id = "req_resume_once"

    with client.websocket_connect("/widget/session") as first_socket:
        first_socket.send_json(
            {
                "type": "chat.request",
                "request": {"agentId": agent_id, "requestId": request_id, "message": "hello"},
            }
        )
        assert started.wait(2)

        with client.websocket_connect("/widget/session") as second_socket:
            second_socket.send_json(
                {
                    "type": "chat.request",
                    "request": {
                        "agentId": agent_id,
                        "requestId": request_id,
                        "message": "hello",
                    },
                }
            )
            second = second_socket.receive_json()

        conversation_id = UUID(second["response"]["conversationId"])
        assert second["response"]["requestId"] == request_id
        assert second["response"]["messages"] == [{"role": "assistant", "content": "fresh response"}]

        release.set()
        assert first_returned.wait(2)
        first = first_socket.receive_json()
        _wait_for(lambda: len([message for message in _conversation_messages(conversation_id) if message[0] == "assistant"]) == 1)

    assert first == {
        "type": "chat.error",
        "error": {
            "code": "RUN_SUPERSEDED",
            "message": "This request has been replaced by a newer one.",
            "retriable": False,
        },
    }

    messages = _conversation_messages(conversation_id)
    assert messages == [
        ("user", "hello"),
        ("assistant", "fresh response"),
        ("tool_context", EMPTY_V2_TOOL_CONTEXT),
    ]

    from app.core.database import session_scope

    with session_scope() as session:
        conversation_count = session.scalar(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.agent_id == UUID(agent_id))
        )

    assert conversation_count == 1


def test_widget_session_newer_request_supersedes_older_in_flight_result(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    started = Event()
    release = Event()
    first_returned = Event()

    class FakeExecutorSupersede:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            if user_message == "old request":
                started.set()
                assert await asyncio.to_thread(release.wait, 2)
                first_returned.set()
                return StepResult(response="stale old response", done=True, messages=[], active_tool_ids=[])
            return StepResult(response="fresh new response", done=True, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorSupersede)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as first_socket:
        first_socket.send_json(
            {
                "type": "chat.request",
                "request": {"agentId": agent_id, "requestId": "req_old", "message": "old request"},
            }
        )
        assert started.wait(2)
        conversation_id = _conversation_id_for_agent(agent_id)

        with client.websocket_connect("/widget/session") as second_socket:
            second_socket.send_json(
                {
                    "type": "chat.request",
                    "request": {
                        "agentId": agent_id,
                        "conversationId": str(conversation_id),
                        "requestId": "req_new",
                        "message": "new request",
                    },
                }
            )
            second = second_socket.receive_json()

        assert second["response"]["requestId"] == "req_new"
        assert second["response"]["messages"] == [{"role": "assistant", "content": "fresh new response"}]

        release.set()
        assert first_returned.wait(2)
        _wait_for(lambda: len([message for message in _conversation_messages(conversation_id) if message[0] == "assistant"]) == 1)

    messages = _conversation_messages(conversation_id)
    assert messages == [
        ("user", "old request"),
        ("user", "new request"),
        ("assistant", "fresh new response"),
        ("tool_context", EMPTY_V2_TOOL_CONTEXT),
    ]


def test_widget_session_replayed_tool_results_are_idempotent_for_same_request(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope
    from app.schemas.widget import ToolCallPayload
    from app.models import Feature, HttpMethod, Tool

    with session_scope() as session:
        feature = Feature(user_id="user_1", name="Catalog")
        session.add(feature)
        session.flush()
        tool_record = Tool(
            user_id="user_1",
            path="/items/{id}",
            method=HttpMethod.get,
            tool={
                "type": "function",
                "function": {
                    "name": "get_item",
                    "description": "Fetch an item",
                    "parameters": {"type": "object", "properties": {}},
                },
            },
            feature_id=feature.id,
            agent_enabled=True,
        )
        session.add(tool_record)
        session.flush()
        tool_id = tool_record.id

    tool_call = ToolCallPayload(
        id="tc_once",
        tool_id=tool_id,
        name="get_item",
        tool_type="backend",
        method="GET",
        path="/items/{id}",
        params={"id": "1"},
        query={},
        body={},
        headers={},
    )

    class FakeExecutorWithReplayableTool:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            if tool_results:
                return StepResult(response="tool done once", done=True, messages=[], active_tool_ids=[])
            return StepResult(tool_calls=[tool_call], done=False, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorWithReplayableTool)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    request_id = "req_tool_once"

    with session_scope() as session:
        account = session.get(BillingAccount, "user_1")
        if not account:
            account = get_or_create_billing_account(session, "user_1")
        account.lifetime_actions_remaining = 2
        account.topup_actions_remaining = 0
        account.monthly_actions_remaining = 0

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(
            websocket,
            {"agentId": agent_id, "requestId": request_id, "message": "start"},
        )

    conversation_id = UUID(first["response"]["conversationId"])
    assert first["response"]["requestId"] == request_id
    assert first["response"]["done"] is False

    with client.websocket_connect("/widget/session") as websocket:
        replay = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "requestId": request_id,
                "message": "start",
            },
        )
        done = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": str(conversation_id),
                "requestId": request_id,
                "toolResults": [{"id": "tc_once", "statusCode": 200, "body": {"ok": True}}],
            },
        )

    with client.websocket_connect("/widget/session") as websocket:
        repeated = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": str(conversation_id),
                "requestId": request_id,
                "toolResults": [{"id": "tc_once", "statusCode": 200, "body": {"ok": True}}],
            },
        )

    assert replay["response"]["requestId"] == request_id
    assert replay["response"]["done"] is False
    assert replay["response"]["toolCalls"] == first["response"]["toolCalls"]
    assert done["response"]["messages"] == [{"role": "assistant", "content": "tool done once"}]
    assert repeated["response"]["messages"] == [{"role": "assistant", "content": "tool done once"}]

    with session_scope() as session:
        billing_count = session.scalar(
            select(func.count())
            .select_from(BillingActionConsumption)
            .where(
                BillingActionConsumption.user_id == "user_1",
                BillingActionConsumption.conversation_id == conversation_id,
                BillingActionConsumption.tool_call_id == "tc_once",
            )
        )
        action_count = session.scalar(
            select(func.count())
            .select_from(ConversationAction)
            .where(
                ConversationAction.user_id == "user_1",
                ConversationAction.conversation_id == conversation_id,
                ConversationAction.tool_call_id == "tc_once",
            )
        )
        account = session.get(BillingAccount, "user_1")
        remaining = account.lifetime_actions_remaining if account is not None else None

    assert billing_count == 1
    assert action_count == 1
    assert remaining == 1


def test_widget_session_restores_pending_state_on_new_socket(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.schemas.widget import ToolCallPayload

    pending_tool_id = uuid4()
    pending_input_items_expected = [
        {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "start"}]},
        {"type": "function_call", "call_id": "tc_ws_resume", "name": "get_user", "arguments": '{"id":"123"}'},
    ]
    tool_call = ToolCallPayload(
        id="tc_ws_resume",
        tool_id=pending_tool_id,
        name="get_user",
        tool_type="backend",
        method="GET",
        path="/users/{id}",
        params={"id": "123"},
        query={},
        body={},
        headers={},
    )

    class FakeResumableSocketExecutor:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            if tool_results:
                assert active_tool_ids == [pending_tool_id]
                assert pending_input_items == pending_input_items_expected
                assert pending_messages is None
                return StepResult(
                    response="resumed via websocket",
                    done=True,
                    messages=[],
                    responses_input_items=pending_input_items + [
                        {"type": "function_call_output", "call_id": "tc_ws_resume", "output": '{"ok": true}'},
                    ],
                    active_tool_ids=[],
                )
            return StepResult(
                tool_calls=[tool_call],
                done=False,
                messages=[HumanMessage(content="pending websocket state")],
                responses_input_items=list(pending_input_items_expected),
                active_tool_ids=[pending_tool_id],
            )

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeResumableSocketExecutor)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    request_id = "req_ws_resume"

    with client.websocket_connect("/widget/session") as websocket:
        websocket.send_json(
            {
                "type": "chat.request",
                "request": {"agentId": agent_id, "requestId": request_id, "message": "start"},
            }
        )
        first = websocket.receive_json()
        assert first["type"] == "chat.response"
        assert first["response"]["done"] is False

    conversation_id = first["response"]["conversationId"]

    with client.websocket_connect("/widget/session") as websocket:
        websocket.send_json(
            {
                "type": "chat.request",
                "request": {
                    "agentId": agent_id,
                    "conversationId": conversation_id,
                    "requestId": request_id,
                    "toolResults": [{"id": "tc_ws_resume", "statusCode": 200, "consumeAction": False, "body": {"ok": True}}],
                },
            }
        )
        second = websocket.receive_json()

    assert second["type"] == "chat.response"
    assert second["response"]["done"] is True
    assert second["response"]["messages"] == [{"role": "assistant", "content": "resumed via websocket"}]


def test_widget_session_rewrites_legacy_pending_state_to_v2(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    import json

    from fastapi.encoders import jsonable_encoder
    from langchain_core.messages import messages_to_dict
    from app.core.database import session_scope
    from app.schemas.widget import ToolCallPayload
    from app.services.openai_responses_ws import OpenAIResponsesWebSocketSession
    from app.services.widget_service import get_tool_context, save_pending_state

    pending_tool_id = uuid4()
    legacy_messages = [HumanMessage(content="legacy pending websocket state")]
    expected_input_items = OpenAIResponsesWebSocketSession.messages_to_input_items(legacy_messages)
    tool_call = ToolCallPayload(
        id="tc_ws_legacy",
        tool_id=pending_tool_id,
        name="get_user",
        tool_type="backend",
        method="GET",
        path="/users/{id}",
        params={"id": "123"},
        query={},
        body={},
        headers={},
    )

    class FakeLegacyPendingExecutor:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            if tool_results:
                assert pending_input_items == expected_input_items
                assert active_tool_ids == [pending_tool_id]
                return StepResult(
                    response="legacy resumed",
                    done=True,
                    messages=[],
                    responses_input_items=[
                        {"type": "compaction", "encrypted_content": "compact_1"},
                        {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "legacy resumed"}]},
                    ],
                    active_tool_ids=[],
                )
            return StepResult(
                tool_calls=[tool_call],
                done=False,
                messages=[],
                responses_input_items=[{"type": "message", "role": "user", "content": [{"type": "input_text", "text": "start"}]}],
                active_tool_ids=[pending_tool_id],
            )

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeLegacyPendingExecutor)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    request_id = "req_ws_legacy"

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(
            websocket,
            {"agentId": agent_id, "requestId": request_id, "message": "start"},
        )
    conversation_id = first["response"]["conversationId"]

    with session_scope() as db_session:
        save_pending_state(
            db_session,
            UUID(conversation_id),
            json.dumps(
                jsonable_encoder(
                    {
                        "messages": messages_to_dict(legacy_messages),
                        "tool_ids": [str(pending_tool_id)],
                        "tool_calls": [tool_call.model_dump(by_alias=True)],
                    }
                )
            ),
        )

    with client.websocket_connect("/widget/session") as websocket:
        second = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": conversation_id,
                "requestId": request_id,
                "toolResults": [{"id": "tc_ws_legacy", "statusCode": 200, "consumeAction": False, "body": {"ok": True}}],
            },
        )

    assert second["type"] == "chat.response"
    assert second["response"]["done"] is True
    assert second["response"]["messages"] == [{"role": "assistant", "content": "legacy resumed"}]

    with session_scope() as db_session:
        saved_context = json.loads(get_tool_context(db_session, UUID(conversation_id)))
    assert saved_context["version"] == 2
    assert saved_context["format"] == "responses_input_items"


def test_widget_session_emits_retriable_error_for_invalid_v2_pending_state(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    import json

    from app.core.database import session_scope
    from app.schemas.widget import ToolCallPayload
    from app.services.widget_service import save_pending_state

    tool_call = ToolCallPayload(
        id="tc_ws_invalid",
        tool_id=uuid4(),
        name="get_user",
        tool_type="backend",
        method="GET",
        path="/users/{id}",
        params={"id": "123"},
        query={},
        body={},
        headers={},
    )

    class FakeInvalidPendingExecutor:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            return StepResult(
                tool_calls=[tool_call],
                done=False,
                messages=[],
                responses_input_items=[{"type": "message", "role": "user", "content": [{"type": "input_text", "text": "start"}]}],
                active_tool_ids=[],
            )

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeInvalidPendingExecutor)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    request_id = "req_ws_invalid"

    with client.websocket_connect("/widget/session") as websocket:
        first = send_widget_request(
            websocket,
            {"agentId": agent_id, "requestId": request_id, "message": "start"},
        )
    conversation_id = first["response"]["conversationId"]

    with session_scope() as db_session:
        save_pending_state(
            db_session,
            UUID(conversation_id),
            json.dumps(
                {
                    "version": 2,
                    "format": "responses_input_items",
                    "input_items": "invalid",
                    "tool_ids": [],
                    "tool_calls": [],
                }
            ),
        )

    with client.websocket_connect("/widget/session") as websocket:
        second = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "conversationId": conversation_id,
                "requestId": request_id,
                "toolResults": [{"id": "tc_ws_invalid", "statusCode": 200, "consumeAction": False, "body": {"ok": True}}],
            },
        )

    assert second == {
        "type": "chat.error",
        "error": {
            "code": "PENDING_STATE_INVALID",
            "message": "Couldn't resume this request. Please try again.",
            "retriable": True,
        },
    }


def test_widget_session_emits_auth_error(client: TestClient):
    from app.core.database import session_scope
    from app.models import Agent

    agent_response = client.post("/agent", headers=auth_headers())
    agent_id = agent_response.json()["id"]

    with session_scope() as db_session:
        agent = db_session.get(Agent, UUID(agent_id))
        assert agent is not None
        agent.widget_auth_enabled = True

    with client.websocket_connect("/widget/session") as websocket:
        websocket.send_json(
            {
                "type": "chat.request",
                "request": {"agentId": agent_id, "requestId": "req_auth", "message": "start"},
            }
        )
        response = websocket.receive_json()

    assert response == {
        "type": "chat.error",
        "error": {
            "code": "WIDGET_AUTH_REQUIRED",
            "message": "Signed widget token required",
            "retriable": False,
        },
    }


def test_widget_session_emits_transport_error(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.services.openai_responses_ws import OpenAIResponsesTransportError

    class FakeTransportErrorExecutor:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            raise OpenAIResponsesTransportError(
                code="openai_api_key_missing",
                message="OpenAI API key missing",
                status=500,
                retriable=False,
            )

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeTransportErrorExecutor)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        websocket.send_json(
            {
                "type": "chat.request",
                "request": {"agentId": agent_id, "requestId": "req_transport", "message": "start"},
            }
        )
        response = websocket.receive_json()

    assert response == {
        "type": "chat.error",
        "error": {
            "code": "openai_api_key_missing",
            "message": "OpenAI API key missing",
            "retriable": False,
        },
    }


def test_widget_session_times_out_before_first_request(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.controllers.widget.INITIAL_SOCKET_REQUEST_TIMEOUT_SECONDS", 0.05)

    with client.websocket_connect("/widget/session") as websocket:
        with pytest.raises(WebSocketDisconnect) as error:
            websocket.receive_json()

    assert error.value.code == 1008


def test_widget_session_emits_timeout_waiting_for_next_request(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.schemas.widget import ToolCallPayload

    monkeypatch.setattr("app.controllers.widget.SOCKET_REQUEST_TIMEOUT_SECONDS", 0.05)

    tool_call = ToolCallPayload(
        id="tc_ws_timeout",
        tool_id=uuid4(),
        name="get_user",
        tool_type="backend",
        method="GET",
        path="/users/{id}",
        params={"id": "123"},
        query={},
        body={},
        headers={},
    )

    class FakeTimeoutSocketExecutor:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            return StepResult(tool_calls=[tool_call], done=False, messages=[], active_tool_ids=[])

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeTimeoutSocketExecutor)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]
    request_id = "req_timeout"

    with client.websocket_connect("/widget/session") as websocket:
        websocket.send_json(
            {
                "type": "chat.request",
                "request": {"agentId": agent_id, "requestId": request_id, "message": "start"},
            }
        )
        first = websocket.receive_json()
        assert first["type"] == "chat.response"
        assert first["response"]["done"] is False

        second = websocket.receive_json()

    assert second == {
        "type": "chat.error",
        "error": {
            "code": "SESSION_TIMEOUT",
            "message": "Widget session timed out",
            "retriable": True,
        },
    }


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


def test_widget_session_persists_v2_tool_context_on_done(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    import json

    persisted_input_items = [
        {"type": "compaction", "encrypted_content": "compact_1"},
        {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "done"}]},
    ]

    class FakeExecutorWithLargeMessages:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            return StepResult(
                response="done",
                done=True,
                messages=[],
                responses_input_items=persisted_input_items,
                active_tool_ids=[],
            )

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorWithLargeMessages)

    saved_content: list[str] = []

    import app.controllers.widget as widget_mod
    original_save = widget_mod.save_tool_context

    def capture_save(session, conversation_id, content):
        saved_content.append(content)
        return original_save(session, conversation_id, content)

    monkeypatch.setattr("app.controllers.widget.save_tool_context", capture_save)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "message": "hello",
            },
        )

    assert response["type"] == "chat.response"
    assert response["response"]["done"] is True
    assert len(saved_content) == 1
    payload = json.loads(saved_content[0])
    assert payload == {
        "version": 2,
        "format": "responses_input_items",
        "input_items": persisted_input_items,
    }


def test_widget_session_persists_v2_pending_state_on_tool_calls(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    import json
    from app.schemas.widget import ToolCallPayload

    persisted_input_items = [
        {"type": "compaction", "encrypted_content": "compact_1"},
        {"type": "function_call", "call_id": "tc_1", "name": "do_thing", "arguments": "{}"},
    ]
    tool_call = ToolCallPayload(
        id="tc_1",
        tool_id=uuid4(),
        name="do_thing",
        tool_type="backend",
        method="GET",
        path="/items",
        params={},
        query={},
        body={},
        headers={},
    )

    class FakeExecutorWithLargeState:
        def __init__(self, session, user_id, conversation_id=None, redis_client=None, **_kwargs):
            pass

        async def run_step(
            self,
            user_message,
            conversation_history,
            tool_results=None,
            pending_messages=None,
            active_tool_ids=None,
            pending_input_items=None,
        ):
            return StepResult(
                tool_calls=[tool_call],
                done=False,
                messages=[],
                responses_input_items=persisted_input_items,
                active_tool_ids=[],
            )

    monkeypatch.setattr("app.controllers.widget.AgentExecutor", FakeExecutorWithLargeState)

    saved_messages: list[str] = []

    import app.controllers.widget as widget_mod
    original_save_pending_state = widget_mod.save_pending_state

    def capture_save_pending_state(session, conversation_id, content):
        saved_messages.append(content)
        return original_save_pending_state(session, conversation_id, content)

    monkeypatch.setattr("app.controllers.widget.save_pending_state", capture_save_pending_state)

    agent = client.post("/agent", headers=auth_headers())
    agent_id = agent.json()["id"]

    with client.websocket_connect("/widget/session") as websocket:
        response = send_widget_request(
            websocket,
            {
                "agentId": agent_id,
                "message": "start",
            },
        )

    assert response["type"] == "chat.response"
    assert response["response"]["done"] is False
    assert len(saved_messages) == 1
    state_data = json.loads(saved_messages[0])
    assert state_data["version"] == 2
    assert state_data["format"] == "responses_input_items"
    assert state_data["input_items"] == persisted_input_items
    assert state_data["tool_calls"][0]["id"] == "tc_1"
