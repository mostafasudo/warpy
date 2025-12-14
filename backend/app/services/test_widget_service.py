import importlib
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.models import Agent, AuthType, SessionHeader, StorageSource
from app.services.widget_service import (
    create_widget_conversation,
    get_agent_by_id,
    get_pending_state,
    get_tool_context,
    get_widget_config,
    get_widget_conversation,
    get_widget_messages,
    save_tool_context,
    save_widget_message,
)


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


@pytest.fixture
def db_session():
    session = next(get_session())
    try:
        yield session
    finally:
        session.close()


def test_get_agent_by_id_not_found(db_session: Session):
    result = get_agent_by_id(db_session, uuid4())
    assert result is None


def test_get_agent_by_id_found(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    result = get_agent_by_id(db_session, agent.id)
    assert result is not None
    assert result.id == agent.id


def test_get_widget_config_empty(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    config = get_widget_config(db_session, agent)
    assert config.headers == {}
    assert config.require_signed_widget_token is False
    assert config.widget_refresh_endpoint_path == "/widget-token"


def test_get_widget_config_with_headers(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    header = SessionHeader(
        user_id="user_1",
        header_name="Authorization",
        source=StorageSource.local_storage,
        key="auth_token"
    )
    db_session.add(header)
    db_session.flush()

    config = get_widget_config(db_session, agent)
    assert "Authorization" in config.headers
    assert config.headers["Authorization"].source == StorageSource.local_storage
    assert config.headers["Authorization"].key == "auth_token"
    assert config.headers["Authorization"].auth_type == AuthType.bearer


def test_create_widget_conversation(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)
    assert conversation.agent_id == agent.id
    assert conversation.participant == "widget"


def test_create_widget_conversation_custom_participant(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id, "custom")
    assert conversation.participant == "custom"


def test_get_widget_conversation_not_found(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    result = get_widget_conversation(db_session, uuid4(), agent.id)
    assert result is None


def test_get_widget_conversation_wrong_agent(db_session: Session):
    agent1 = Agent(user_id="user_1")
    agent2 = Agent(user_id="user_2")
    db_session.add(agent1)
    db_session.add(agent2)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent1.id)

    result = get_widget_conversation(db_session, conversation.id, agent2.id)
    assert result is None


def test_get_widget_conversation_found(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    result = get_widget_conversation(db_session, conversation.id, agent.id)
    assert result is not None
    assert result.id == conversation.id


def test_save_and_get_widget_messages(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    save_widget_message(db_session, conversation.id, "user", "hello")
    save_widget_message(db_session, conversation.id, "assistant", "hi there")

    messages = get_widget_messages(db_session, conversation.id)
    assert len(messages) == 2
    assert messages[0].role == "user"
    assert messages[0].content == "hello"
    assert messages[1].role == "assistant"
    assert messages[1].content == "hi there"


def test_save_and_get_tool_context(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    save_tool_context(db_session, conversation.id, "serialized_context")

    result = get_tool_context(db_session, conversation.id)
    assert result == "serialized_context"


def test_save_tool_context_updates_existing(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    save_tool_context(db_session, conversation.id, "first")
    save_tool_context(db_session, conversation.id, "second")

    result = get_tool_context(db_session, conversation.id)
    assert result == "second"


def test_get_tool_context_not_found(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    result = get_tool_context(db_session, conversation.id)
    assert result is None


def test_get_pending_state_returns_latest(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    save_widget_message(db_session, conversation.id, "user", "hello")
    save_widget_message(db_session, conversation.id, "pending_state", "state_data")

    result = get_pending_state(db_session, conversation.id)
    assert result == "state_data"


def test_get_pending_state_not_found(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    result = get_pending_state(db_session, conversation.id)
    assert result is None
