import importlib
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.core.database import session_scope
from app.main import create_app
from app.models import Agent, Conversation, ConversationAction, Endpoint, Feature, HttpMethod, Message
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


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as client:
        yield client


def auth_headers():
    return {"Authorization": "Bearer token"}


def test_activity_summary_returns_empty_when_no_agent(client: TestClient):
    response = client.get("/activity/summary", headers=auth_headers())
    assert response.status_code == 200
    assert response.json() == {"conversationCount": 0, "actionCount": 0, "topActions": []}


def test_activity_summary_counts_conversations_and_top_actions(client: TestClient):
    agent_response = client.post("/agent", headers=auth_headers())
    assert agent_response.status_code == 201
    agent_id = UUID(agent_response.json()["id"])

    with session_scope() as session:
        agent = session.get(Agent, agent_id)
        assert agent
        feature = Feature(user_id="user_1", name="Catalog")
        session.add(feature)
        session.flush()
        endpoint = Endpoint(
            user_id="user_1",
            path="/products",
            method=HttpMethod.get,
            tool={
                "type": "function",
                "function": {"name": "list_products", "description": "Fetch products", "parameters": {"type": "object", "properties": {}}},
            },
            feature_id=feature.id,
            agent_enabled=True,
        )
        session.add(endpoint)
        session.flush()
        conversation = Conversation(agent_id=agent.id, participant="widget")
        session.add(conversation)
        session.flush()
        session.add_all([
            ConversationAction(
                user_id="user_1",
                conversation_id=conversation.id,
                endpoint_id=endpoint.id,
                feature_id=feature.id,
                tool_call_id="tc_1",
                request={"params": {}, "query": {}, "body": {}},
                status_code=200,
                error=None,
            ),
            ConversationAction(
                user_id="user_1",
                conversation_id=conversation.id,
                endpoint_id=endpoint.id,
                feature_id=feature.id,
                tool_call_id="tc_2",
                request={"params": {}, "query": {}, "body": {}},
                status_code=200,
                error=None,
            ),
        ])

    response = client.get("/activity/summary", headers=auth_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["conversationCount"] == 1
    assert body["actionCount"] == 2
    assert body["topActions"] == [{"feature": "Catalog", "action": "Fetch products", "count": 2}]


def test_activity_summary_rejects_invalid_date_range(client: TestClient):
    response = client.get("/activity/summary?start_date=2026-01-02&end_date=2026-01-01", headers=auth_headers())
    assert response.status_code == 400
    assert "start_date" in response.json()["detail"]


def test_activity_conversations_paginates_and_includes_counts(client: TestClient):
    agent_response = client.post("/agent", headers=auth_headers())
    assert agent_response.status_code == 201
    agent_id = UUID(agent_response.json()["id"])

    now = datetime.now(tz=UTC)

    with session_scope() as session:
        agent = session.get(Agent, agent_id)
        assert agent
        feature = Feature(user_id="user_1", name="Catalog")
        session.add(feature)
        session.flush()
        endpoint = Endpoint(
            user_id="user_1",
            path="/products",
            method=HttpMethod.get,
            tool={"type": "function", "function": {"name": "list_products", "description": "Fetch products", "parameters": {"type": "object", "properties": {}}}},
            feature_id=feature.id,
            agent_enabled=True,
        )
        session.add(endpoint)
        session.flush()

        conversations: list[Conversation] = []
        for index in range(3):
            conversation = Conversation(agent_id=agent.id, participant="widget")
            session.add(conversation)
            session.flush()
            conversation.updated_at = now - timedelta(hours=index)
            conversations.append(conversation)

        session.add_all([
            Message(conversation_id=conversations[0].id, role="user", content="u1"),
            Message(conversation_id=conversations[0].id, role="user", content="u2"),
            Message(conversation_id=conversations[0].id, role="assistant", content="a1"),
            Message(conversation_id=conversations[1].id, role="user", content="u3"),
        ])

        session.add_all([
            ConversationAction(
                user_id="user_1",
                conversation_id=conversations[0].id,
                endpoint_id=endpoint.id,
                feature_id=feature.id,
                tool_call_id="tc_1",
                request={"params": {}, "query": {}, "body": {}},
                status_code=200,
            ),
            ConversationAction(
                user_id="user_1",
                conversation_id=conversations[0].id,
                endpoint_id=endpoint.id,
                feature_id=feature.id,
                tool_call_id="tc_2",
                request={"params": {}, "query": {}, "body": {}},
                status_code=200,
            ),
            ConversationAction(
                user_id="user_1",
                conversation_id=conversations[1].id,
                endpoint_id=endpoint.id,
                feature_id=feature.id,
                tool_call_id="tc_3",
                request={"params": {}, "query": {}, "body": {}},
                status_code=200,
            ),
        ])

    first = client.get("/activity/conversations?start_date=2000-01-01&end_date=2100-01-01&limit=2", headers=auth_headers())
    assert first.status_code == 200
    first_body = first.json()
    assert len(first_body["items"]) == 2
    assert first_body["nextCursor"]
    assert first_body["items"][0]["userMessageCount"] == 2
    assert first_body["items"][0]["actionCount"] == 2
    assert first_body["items"][1]["userMessageCount"] == 1
    assert first_body["items"][1]["actionCount"] == 1

    second = client.get(
        f"/activity/conversations?start_date=2000-01-01&end_date=2100-01-01&limit=2&cursor={first_body['nextCursor']}",
        headers=auth_headers(),
    )
    assert second.status_code == 200
    second_body = second.json()
    assert len(second_body["items"]) == 1
    assert second_body["nextCursor"] is None
    assert second_body["items"][0]["userMessageCount"] == 0
    assert second_body["items"][0]["actionCount"] == 0


def test_activity_conversation_detail_paginates_messages_and_actions(client: TestClient):
    agent_response = client.post("/agent", headers=auth_headers())
    assert agent_response.status_code == 201
    agent_id = UUID(agent_response.json()["id"])

    now = datetime.now(tz=UTC)

    with session_scope() as session:
        agent = session.get(Agent, agent_id)
        assert agent
        feature = Feature(user_id="user_1", name="Catalog")
        session.add(feature)
        session.flush()
        endpoint = Endpoint(
            user_id="user_1",
            path="/products",
            method=HttpMethod.get,
            tool={"type": "function", "function": {"name": "list_products", "description": "Fetch products", "parameters": {"type": "object", "properties": {}}}},
            feature_id=feature.id,
            agent_enabled=True,
        )
        session.add(endpoint)
        session.flush()

        conversation = Conversation(agent_id=agent.id, participant="widget")
        session.add(conversation)
        session.flush()

        session.add_all([
            Message(conversation_id=conversation.id, role="user", content="m1", created_at=now - timedelta(minutes=3)),
            Message(conversation_id=conversation.id, role="assistant", content="m2", created_at=now - timedelta(minutes=2)),
            Message(conversation_id=conversation.id, role="user", content="m3", created_at=now - timedelta(minutes=1)),
        ])

        session.add_all([
            ConversationAction(
                user_id="user_1",
                conversation_id=conversation.id,
                endpoint_id=endpoint.id,
                feature_id=feature.id,
                tool_call_id="tc_1",
                request={"params": {}, "query": {}, "body": {}},
                status_code=200,
                created_at=now - timedelta(minutes=2),
            ),
            ConversationAction(
                user_id="user_1",
                conversation_id=conversation.id,
                endpoint_id=endpoint.id,
                feature_id=feature.id,
                tool_call_id="tc_2",
                request={"params": {}, "query": {}, "body": {}},
                status_code=200,
                created_at=now - timedelta(minutes=1),
            ),
        ])
        conversation_id = conversation.id

    first = client.get(f"/activity/conversations/{conversation_id}?message_limit=2&action_limit=1", headers=auth_headers())
    assert first.status_code == 200
    body = first.json()
    assert [msg["content"] for msg in body["messages"]] == ["m2", "m3"]
    assert body["nextMessageCursor"]
    assert len(body["actions"]) == 1
    assert body["actions"][0]["feature"] == "Catalog"
    assert body["actions"][0]["action"] == "Fetch products"
    assert body["nextActionCursor"]

    earlier = client.get(
        f"/activity/conversations/{conversation_id}?message_limit=10&message_cursor={body['nextMessageCursor']}",
        headers=auth_headers(),
    )
    assert earlier.status_code == 200
    earlier_body = earlier.json()
    assert [msg["content"] for msg in earlier_body["messages"]] == ["m1"]
    assert earlier_body["nextMessageCursor"] is None

    action_earlier = client.get(
        f"/activity/conversations/{conversation_id}?action_limit=10&action_cursor={body['nextActionCursor']}",
        headers=auth_headers(),
    )
    assert action_earlier.status_code == 200
    action_body = action_earlier.json()
    assert len(action_body["actions"]) == 1
    assert action_body["actions"][0]["action"] == "Fetch products"
    assert action_body["nextActionCursor"] is None
