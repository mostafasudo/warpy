import importlib

import pytest

from app.core.database import session_scope
from sqlalchemy import func, select

from app.models import Agent, Conversation, ConversationAction, Tool, Feature, HttpMethod
from app.schemas.widget import ToolResultPayload
from app.services.conversation_actions_service import ToolCallForLog, record_widget_tool_results


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch: pytest.MonkeyPatch):
    from app.core import database
    from app.core.config import get_settings

    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
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


def test_record_widget_tool_results_records_and_sanitizes():
    user_id = "user_1"

    with session_scope() as session:
        agent = Agent(user_id=user_id)
        session.add(agent)
        session.flush()
        feature = Feature(user_id=user_id, name="Catalog")
        session.add(feature)
        session.flush()
        tool_record = Tool(
            user_id=user_id,
            path="/products",
            method=HttpMethod.post,
            tool={"type": "function", "function": {"name": "create_product", "description": "Create product", "parameters": {"type": "object", "properties": {}}}},
            feature_id=feature.id,
        )
        session.add(tool_record)
        session.flush()
        conversation = Conversation(agent_id=agent.id, participant="widget")
        session.add(conversation)
        session.flush()

        record_widget_tool_results(
            session,
            user_id,
            conversation.id,
            tool_results=[ToolResultPayload(id="tc_1", statusCode=200, body={"ok": True, "token": "xyz"})],
            tool_calls=[
                ToolCallForLog(
                    id="tc_1",
                    tool_type="backend",
                    tool_id=tool_record.id,
                    params={"id": "123"},
                    query={},
                    body={"password": "secret", "token": "abc", "nested": [{"apiKey": "k"}]},
                )
            ],
        )
        session.flush()

        action = session.scalar(select(ConversationAction).where(ConversationAction.tool_call_id == "tc_1"))
        assert action
        assert action.tool_id == tool_record.id
        assert action.feature_id == feature.id
        assert action.status_code == 200
        assert action.request["params"] == {"id": "123"}
        assert action.request["body"]["password"] == "***"
        assert action.request["body"]["token"] == "***"
        assert action.request["body"]["nested"][0]["apiKey"] == "***"
        assert action.response_body == {"ok": True, "token": "***"}


def test_record_widget_tool_results_is_idempotent():
    user_id = "user_1"

    with session_scope() as session:
        agent = Agent(user_id=user_id)
        session.add(agent)
        session.flush()
        feature = Feature(user_id=user_id, name="Catalog")
        session.add(feature)
        session.flush()
        tool_record = Tool(
            user_id=user_id,
            path="/products",
            method=HttpMethod.get,
            tool={"type": "function", "function": {"name": "list_products", "description": "Fetch products", "parameters": {"type": "object", "properties": {}}}},
            feature_id=feature.id,
        )
        session.add(tool_record)
        session.flush()
        conversation = Conversation(agent_id=agent.id, participant="widget")
        session.add(conversation)
        session.flush()

        args = dict(
            tool_results=[ToolResultPayload(id="tc_1", statusCode=200, body={"ok": True})],
            tool_calls=[ToolCallForLog(id="tc_1", tool_type="backend", tool_id=tool_record.id, params={}, query={}, body={})],
        )

        record_widget_tool_results(session, user_id, conversation.id, **args)
        record_widget_tool_results(session, user_id, conversation.id, **args)
        session.flush()

        count = session.scalar(select(func.count()).select_from(ConversationAction).where(ConversationAction.tool_call_id == "tc_1"))
        assert count == 1


def test_record_widget_tool_results_keeps_frontend_tool_type():
    user_id = "user_1"

    with session_scope() as session:
        agent = Agent(user_id=user_id)
        session.add(agent)
        session.flush()
        feature = Feature(user_id=user_id, name="UI")
        session.add(feature)
        session.flush()
        frontend_tool = Tool(
            user_id=user_id,
            tool_type="frontend",
            path=None,
            method=None,
            tool={"type": "function", "function": {"name": "open_drawer", "description": "Open drawer", "parameters": {"type": "object", "properties": {}}}},
            feature_id=feature.id,
        )
        session.add(frontend_tool)
        session.flush()
        conversation = Conversation(agent_id=agent.id, participant="widget")
        session.add(conversation)
        session.flush()

        record_widget_tool_results(
            session,
            user_id,
            conversation.id,
            tool_results=[ToolResultPayload(id="tc_front_1", statusCode=200, body={"ok": True})],
            tool_calls=[
                ToolCallForLog(
                    id="tc_front_1",
                    tool_type="frontend",
                    tool_id=frontend_tool.id,
                    params={"drawer": "orders"},
                    query={},
                    body={},
                )
            ],
        )
        session.flush()

        action = session.scalar(select(ConversationAction).where(ConversationAction.tool_call_id == "tc_front_1"))
        assert action
        assert action.tool_type == "frontend"
        assert action.tool_id == frontend_tool.id
        assert action.response_body == {"ok": True}
