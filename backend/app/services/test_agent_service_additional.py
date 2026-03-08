import importlib

import pytest
from fastapi import HTTPException

from app.core.agent_custom_system_prompt import DEFAULT_CUSTOM_USER_SYSTEM_PROMPT
from app.core import database
from app.core.config import get_settings
from app.models import Agent, Base
from app.services.agent_service import build_agent_executor_config, create_agent


def setup_session(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    get_settings.cache_clear()
    importlib.reload(database)
    database._engine = None
    database._SessionLocal = None
    engine = database.get_engine()
    Base.metadata.create_all(engine)
    return engine


def test_create_agent_conflict(monkeypatch: pytest.MonkeyPatch):
    engine = setup_session(monkeypatch)
    try:
        with database.session_scope() as session:
            create_agent(session, "user")
            with pytest.raises(HTTPException):
                create_agent(session, "user")
    finally:
        engine.dispose()


def test_build_agent_executor_config_defaults_without_agent():
    config = build_agent_executor_config(None)
    assert config == {
        "frontend_capability_enabled": True,
        "knowledge_base_enabled": False,
        "widget_suggestions_enabled": False,
        "custom_user_system_prompt": DEFAULT_CUSTOM_USER_SYSTEM_PROMPT,
    }


def test_build_agent_executor_config_defaults_transient_agent_fields():
    agent = Agent(user_id="user")
    config = build_agent_executor_config(agent)
    assert config == {
        "frontend_capability_enabled": True,
        "knowledge_base_enabled": False,
        "widget_suggestions_enabled": False,
        "custom_user_system_prompt": DEFAULT_CUSTOM_USER_SYSTEM_PROMPT,
    }


def test_build_agent_executor_config_uses_agent_values():
    agent = Agent(
        user_id="user",
        frontend_capability_enabled=False,
        knowledge_base_enabled=True,
        widget_suggestions_enabled=True,
        custom_user_system_prompt="Keep it short.",
    )
    config = build_agent_executor_config(agent)
    assert config == {
        "frontend_capability_enabled": False,
        "knowledge_base_enabled": True,
        "widget_suggestions_enabled": True,
        "custom_user_system_prompt": "Keep it short.",
    }
