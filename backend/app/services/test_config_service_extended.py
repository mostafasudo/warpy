import importlib

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.core import database
from app.core.config import get_settings
from app.models import Base, Environment, SessionHeader
from app.services.config_service import REQUIRED_ENVIRONMENTS, ensure_required_environments, get_config, upsert_config, _dialect_name, _conflict_insert
from app.schemas.config import ConfigPayload


@pytest.fixture()
def session(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    get_settings.cache_clear()
    importlib.reload(database)
    database._engine = None
    database._SessionLocal = None
    engine = database.get_engine()
    Base.metadata.create_all(engine)
    with database.session_scope() as session:
        yield session
    engine.dispose()


def test_ensure_required_environments_inserts_defaults(session):
    ensure_required_environments(session, "user")
    names = {row[0] for row in session.execute(text("select name from environments"))}
    assert REQUIRED_ENVIRONMENTS.issubset(names)


def test_upsert_config_handles_missing_required_envs(session):
    payload = ConfigPayload(baseUrl={"local": "http://localhost"}, headers={})
    with pytest.raises(Exception):
        upsert_config(session, "user", payload)


def test_upsert_config_replaces_headers_and_envs(session):
    payload = ConfigPayload(
        baseUrl={"local": "http://localhost", "production": "https://api"},
        headers={"auth": {"source": "localStorage", "key": "token"}}
    )
    saved = upsert_config(session, "user", payload)
    assert saved.baseUrl["production"] == "https://api"
    second = ConfigPayload(
        baseUrl={"local": "http://localhost:4000", "production": "https://api"},
        headers={}
    )
    saved2 = upsert_config(session, "user", second)
    assert "auth" not in saved2.headers
    envs = {row[0] for row in session.execute(text("select name from environments"))}
    assert "production" in envs and "local" in envs


class _FakeDialect:
    def __init__(self, name):
        self.name = name


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows
    def scalars(self):
        return self
    def all(self):
        return self._rows


class _FakeSession:
    def __init__(self, environments=None):
        self.bind = type("B", (), {"dialect": _FakeDialect("other")})()
        self.environments = environments or []
        self.added = []
        self.executed = []
    def scalars(self, query):
        if getattr(query, "column_descriptions", None):
            name = query.column_descriptions[0]["name"]
            if name == "SessionHeader":
                return _FakeResult([])
            if name == "Environment":
                return _FakeResult(self.environments)
        return _FakeResult([])
    def execute(self, query):
        self.executed.append(query)
        if getattr(query, "column_descriptions", None):
            name = query.column_descriptions[0]["name"]
            if name == "Environment":
                return _FakeResult([env.name for env in self.environments])
        return _FakeResult([])
    def add(self, obj):
        self.added.append(obj)
        self.environments.append(obj)
    def flush(self):
        pass


def test_dialect_helpers_and_custom_branch():
    assert _dialect_name(_FakeSession()) == "other"
    assert _conflict_insert(Environment, "other") is None
    assert _conflict_insert(Environment, "sqlite") is not None
    assert _conflict_insert(Environment, "postgresql") is not None
    fake = _FakeSession()
    payload = ConfigPayload(baseUrl={"local": "http://l", "production": "http://p", "staging": "http://s"}, headers={})
    result = upsert_config(fake, "user", payload)
    assert result.baseUrl["staging"] == "http://s"
    assert fake.added


def test_upsert_environments_requires_base_urls(session):
    with pytest.raises(HTTPException):
        upsert_config(session, "user", ConfigPayload(baseUrl={}, headers={}))


def test_fake_session_fallback_branches():
    fake = _FakeSession()
    assert fake.scalars(None).all() == []
    assert fake.execute(None).all() == []
    dummy_query = type("Q", (), {"column_descriptions": [{"name": "Environment"}]})
    assert fake.execute(dummy_query).all() == []
