import importlib
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.models import Agent, AuthType, Message, SessionHeader, StorageSource, WidgetRunStatus
from app.services.widget_service import (
    claim_widget_run,
    claim_widget_run_for_request,
    clear_pending_state,
    clear_widget_run_owner,
    create_widget_conversation,
    get_agent_by_id,
    get_pending_state,
    get_tool_context,
    get_widget_chat_history,
    get_widget_config,
    get_widget_conversation,
    get_widget_run,
    get_widget_run_by_agent_request,
    is_widget_run_owned,
    save_pending_state,
    save_tool_context,
    save_widget_message,
    supersede_other_widget_runs,
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


def _conversation_messages(db_session: Session, conversation_id):
    return list(
        db_session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.sequence)
        ).all()
    )


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
    assert config.auth.mode == "none"
    assert config.send_cookies_with_requests is False
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
    assert config.auth.mode == "header"
    assert config.auth.source == StorageSource.local_storage
    assert config.auth.key == "auth_token"
    assert config.auth.auth_type == AuthType.bearer
    assert config.send_cookies_with_requests is False
    assert config.headers == {}


def test_get_widget_config_treats_authorization_cookies_as_request_credentials(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    header = SessionHeader(
        user_id="user_1",
        header_name="Authorization",
        source=StorageSource.cookies,
        key="",
    )
    db_session.add(header)
    db_session.flush()

    config = get_widget_config(db_session, agent)
    assert config.auth.mode == "none"
    assert config.send_cookies_with_requests is True
    assert config.headers == {}


def test_get_widget_config_preserves_legacy_cookie_backed_authorization_headers(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    header = SessionHeader(
        user_id="user_1",
        header_name="Authorization",
        source=StorageSource.cookies,
        key="legacy_cookie",
        auth_type=AuthType.basic,
    )
    db_session.add(header)
    db_session.flush()

    config = get_widget_config(db_session, agent)
    assert config.auth.mode == "header"
    assert config.auth.source == StorageSource.cookies
    assert config.auth.key == "legacy_cookie"
    assert config.auth.auth_type == AuthType.basic
    assert config.send_cookies_with_requests is False
    assert config.headers == {}


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


def test_save_widget_message_persists_messages_in_sequence_order(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    save_widget_message(db_session, conversation.id, "user", "hello")
    save_widget_message(db_session, conversation.id, "assistant", "hi there")

    messages = _conversation_messages(db_session, conversation.id)
    assert len(messages) == 2
    assert messages[0].role == "user"
    assert messages[0].content == "hello"
    assert messages[1].role == "assistant"
    assert messages[1].content == "hi there"


def test_save_widget_message_increments_sequence(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    msg1 = save_widget_message(db_session, conversation.id, "user", "first")
    msg2 = save_widget_message(db_session, conversation.id, "assistant", "second")
    msg3 = save_widget_message(db_session, conversation.id, "user", "third")

    assert msg1.sequence == 1
    assert msg2.sequence == 2
    assert msg3.sequence == 3


def test_messages_ordered_by_sequence_not_uuid(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    save_widget_message(db_session, conversation.id, "user", "first")
    save_widget_message(db_session, conversation.id, "assistant", "second")
    save_widget_message(db_session, conversation.id, "user", "third")
    save_widget_message(db_session, conversation.id, "assistant", "fourth")

    messages = _conversation_messages(db_session, conversation.id)
    contents = [m.content for m in messages]
    assert contents == ["first", "second", "third", "fourth"]


def test_get_widget_chat_history_excludes_internal_state_rows(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    save_widget_message(db_session, conversation.id, "user", "first")
    save_pending_state(db_session, conversation.id, "internal")
    save_tool_context(db_session, conversation.id, "tool context")
    save_widget_message(db_session, conversation.id, "assistant", "second")

    history = get_widget_chat_history(db_session, conversation.id)

    assert history == [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "second"},
    ]


def test_get_widget_chat_history_can_exclude_current_user_message(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    save_widget_message(db_session, conversation.id, "user", "first")
    save_widget_message(db_session, conversation.id, "assistant", "reply")
    current = save_widget_message(db_session, conversation.id, "user", "current")

    history = get_widget_chat_history(db_session, conversation.id, exclude_message_id=current.id)

    assert history == [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "reply"},
    ]


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
    save_pending_state(db_session, conversation.id, "state_data")

    result = get_pending_state(db_session, conversation.id)
    assert result == "state_data"


def test_save_pending_state_updates_existing_and_removes_stale_rows(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    save_widget_message(db_session, conversation.id, "pending_state", "old")
    save_widget_message(db_session, conversation.id, "pending_state", "older")
    save_pending_state(db_session, conversation.id, "latest")

    messages = _conversation_messages(db_session, conversation.id)
    pending_messages = [message for message in messages if message.role == "pending_state"]

    assert len(pending_messages) == 1
    assert pending_messages[0].content == "latest"


def test_clear_pending_state_removes_existing_rows(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    save_pending_state(db_session, conversation.id, "state_data")
    clear_pending_state(db_session, conversation.id)

    assert get_pending_state(db_session, conversation.id) is None


def test_widget_run_claim_supersede_and_clear_owner(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    run, created = claim_widget_run(db_session, agent.id, conversation.id, "req_1", "owner_1")
    assert created is True
    assert run.status == WidgetRunStatus.running
    assert is_widget_run_owned(db_session, conversation.id, "req_1", "owner_1") is True

    reclaimed, created = claim_widget_run(db_session, agent.id, conversation.id, "req_1", "owner_2")
    assert created is False
    assert reclaimed.id == run.id
    assert reclaimed.owner_token == "owner_2"
    reclaimed.status = WidgetRunStatus.waiting_for_tools
    db_session.flush()

    claim_widget_run(db_session, agent.id, conversation.id, "req_2", "owner_3")
    superseded = supersede_other_widget_runs(db_session, conversation.id, "req_2")

    assert superseded == ["req_1"]
    assert is_widget_run_owned(db_session, conversation.id, "req_1", "owner_2") is False

    superseded_run = get_widget_run(db_session, conversation.id, "req_1")
    assert superseded_run is not None
    assert superseded_run.status == WidgetRunStatus.superseded
    assert superseded_run.owner_token is None

    clear_widget_run_owner(db_session, conversation.id, "req_2", "owner_3")
    active_run = get_widget_run(db_session, conversation.id, "req_2")
    assert active_run is not None
    assert active_run.owner_token is None


def test_claim_widget_run_for_request_reuses_existing_conversation_without_conversation_id(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    first, created = claim_widget_run_for_request(db_session, agent.id, "req_1", "owner_1")
    assert created is True

    second, created = claim_widget_run_for_request(db_session, agent.id, "req_1", "owner_2")
    assert created is False
    assert second.id == first.id
    assert second.conversation_id == first.conversation_id
    assert second.owner_token == "owner_2"

    by_agent = get_widget_run_by_agent_request(db_session, agent.id, "req_1")
    assert by_agent is not None
    assert by_agent.id == first.id


def test_claim_widget_run_for_request_does_not_reclaim_completed_owner(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    run, _created = claim_widget_run_for_request(db_session, agent.id, "req_done", "owner_1")
    run.status = WidgetRunStatus.completed
    run.owner_token = None
    db_session.flush()

    reclaimed, created = claim_widget_run_for_request(db_session, agent.id, "req_done", "owner_2")

    assert created is False
    assert reclaimed.id == run.id
    assert reclaimed.owner_token is None


def test_get_pending_state_not_found(db_session: Session):
    agent = Agent(user_id="user_1")
    db_session.add(agent)
    db_session.flush()

    conversation = create_widget_conversation(db_session, agent.id)

    result = get_pending_state(db_session, conversation.id)
    assert result is None
