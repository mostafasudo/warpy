import importlib

import pytest

from app.core.database import session_scope
from sqlalchemy import func, select

from app.models import Agent, Conversation, ConversationAction, Endpoint, Feature, HttpMethod
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
        endpoint = Endpoint(
            user_id=user_id,
            path="/products",
            method=HttpMethod.post,
            tool={"type": "function", "function": {"name": "create_product", "description": "Create product", "parameters": {"type": "object", "properties": {}}}},
            feature_id=feature.id,
        )
        session.add(endpoint)
        session.flush()
        conversation = Conversation(agent_id=agent.id, participant="widget")
        session.add(conversation)
        session.flush()

        record_widget_tool_results(
            session,
            user_id,
            conversation.id,
            tool_results=[ToolResultPayload(id="tc_1", statusCode=200, body={"ok": True})],
            tool_calls=[
                ToolCallForLog(
                    id="tc_1",
                    endpoint_id=endpoint.id,
                    params={"id": "123"},
                    query={},
                    body={"password": "secret", "token": "abc", "nested": [{"apiKey": "k"}]},
                )
            ],
        )
        session.flush()

        action = session.scalar(select(ConversationAction).where(ConversationAction.tool_call_id == "tc_1"))
        assert action
        assert action.endpoint_id == endpoint.id
        assert action.feature_id == feature.id
        assert action.status_code == 200
        assert action.request["params"] == {"id": "123"}
        assert action.request["body"]["password"] == "***"
        assert action.request["body"]["token"] == "***"
        assert action.request["body"]["nested"][0]["apiKey"] == "***"


def test_record_widget_tool_results_is_idempotent():
    user_id = "user_1"

    with session_scope() as session:
        agent = Agent(user_id=user_id)
        session.add(agent)
        session.flush()
        feature = Feature(user_id=user_id, name="Catalog")
        session.add(feature)
        session.flush()
        endpoint = Endpoint(
            user_id=user_id,
            path="/products",
            method=HttpMethod.get,
            tool={"type": "function", "function": {"name": "list_products", "description": "Fetch products", "parameters": {"type": "object", "properties": {}}}},
            feature_id=feature.id,
        )
        session.add(endpoint)
        session.flush()
        conversation = Conversation(agent_id=agent.id, participant="widget")
        session.add(conversation)
        session.flush()

        args = dict(
            tool_results=[ToolResultPayload(id="tc_1", statusCode=200, body={"ok": True})],
            tool_calls=[ToolCallForLog(id="tc_1", endpoint_id=endpoint.id, params={}, query={}, body={})],
        )

        record_widget_tool_results(session, user_id, conversation.id, **args)
        record_widget_tool_results(session, user_id, conversation.id, **args)
        session.flush()

        count = session.scalar(select(func.count()).select_from(ConversationAction).where(ConversationAction.tool_call_id == "tc_1"))
        assert count == 1
