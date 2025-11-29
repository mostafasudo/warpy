import importlib

import pytest
from fastapi import HTTPException

from app.core import database
from app.core.config import get_settings
from app.models import Base
from app.services.agent_service import create_agent


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
