import importlib

import pytest

from app.core import database
from app.core.config import get_settings
from app.models import Base, Endpoint, HttpMethod
from app.services.user_stats_service import adjust_endpoint_count, get_endpoint_count


@pytest.fixture(autouse=True)
def configure_db(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    get_settings.cache_clear()
    importlib.reload(database)
    database._engine = None
    database._SessionLocal = None
    engine = database.get_engine()
    Base.metadata.create_all(engine)
    try:
        yield
    finally:
        engine.dispose()


def test_counts_seed_and_adjust():
    from app.core.database import session_scope

    with session_scope() as session:
        endpoint = Endpoint(
            user_id="user-1",
            path="/ping",
            method=HttpMethod.get,
            tool={"function": {"name": "ping", "description": "Ping", "parameters": {}}}
        )
        session.add(endpoint)
        session.flush()

        assert get_endpoint_count(session, "user-1") == 1
        assert adjust_endpoint_count(session, "user-1", 2) == 3
        assert adjust_endpoint_count(session, "user-1", -5) == 0
        assert adjust_endpoint_count(session, "user-2", -1) == 0


def test_insert_factory_prefers_postgres():
    from app.services import user_stats_service

    class DummySession:
        def __init__(self, name):
            self.bind = type("B", (), {"dialect": type("D", (), {"name": name})()})()

    assert user_stats_service._insert_factory(DummySession("postgresql")) is user_stats_service.pg_insert
    assert user_stats_service._insert_factory(DummySession("sqlite")) is user_stats_service.sqlite_insert
