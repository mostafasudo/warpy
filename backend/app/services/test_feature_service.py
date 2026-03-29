import importlib

import pytest
from sqlalchemy import select

from app.core import database
from app.core.config import get_settings
from app.models import Base, Tool, Feature, HttpMethod
from app.schemas.tool import ToolPayload
from app.schemas.feature import FeatureSelector
from app.services import feature_service
from app.services.feature_service import (
    _escape_like,
    create_feature,
    delete_feature_if_empty,
    list_features,
    resolve_feature,
    set_feature_enabled
)


@pytest.fixture
def configure_db(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    get_settings.cache_clear()
    importlib.reload(database)
    engine = database.get_engine()
    Base.metadata.create_all(engine)
    try:
        yield
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
        get_settings.cache_clear()


def test_list_features_returns_enabled_state(configure_db):
    from app.core.database import session_scope

    with session_scope() as session:
        feature = create_feature(session, "user-1", "Users")
        create_feature(session, "user-1", "Billing")
        session.add_all([
            Tool(user_id="user-1", path="/users", method=HttpMethod.get, tool={"function": {"name": "list", "description": "list", "parameters": {}}}, agent_enabled=True, feature_id=feature.id),
            Tool(user_id="user-1", tool_type="frontend", tool={"function": {"name": "open_drawer", "description": "open", "parameters": {}}}, agent_enabled=False, feature_id=feature.id)
        ])
        session.flush()

        results = list_features(session, "user-1")
        assert len(results) == 2
        states = {item.name: item.enabled_state for item in results}
        backend_counts = {item.name: item.backend_tool_count for item in results}
        assert states["Users"] == "partial"
        assert states["Billing"] == "disabled"
        assert backend_counts["Users"] == 1
        assert backend_counts["Billing"] == 0


def test_set_feature_enabled_updates_tools(configure_db, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope

    calls: list[str] = []
    monkeypatch.setattr(feature_service, "enqueue_tool_embedding", lambda _i, _u: calls.append("enqueue"))
    monkeypatch.setattr(feature_service, "delete_tool_embedding", lambda _s, _i: calls.append("delete"))

    with session_scope() as session:
        feature = create_feature(session, "user-1", "Users")
        session.add(Tool(user_id="user-1", path="/users", method=HttpMethod.get, tool={"function": {"name": "list", "description": "list", "parameters": {}}}, agent_enabled=False, feature_id=feature.id))
        session.flush()

        updated = set_feature_enabled(session, feature.id, "user-1", True)
        assert len(updated.tools) > 0
        assert updated.tools[0].agent_enabled is True
        assert calls == ["enqueue"]


def test_resolve_feature_auto_reuses_existing(configure_db, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope

    monkeypatch.setattr(feature_service, "classify_feature_name", lambda _payload, _features: "Users")

    with session_scope() as session:
        feature = create_feature(session, "user-1", "Users")
        payload = ToolPayload(
          path="/users",
          method=HttpMethod.get,
          tool={"function": {"name": "get_users", "description": "desc", "parameters": {"type": "object", "properties": {}}}},
          agentEnabled=True,
          feature=FeatureSelector(mode="auto")
        )
        resolved = resolve_feature(session, "user-1", payload.feature, payload)
        assert resolved.id == feature.id


def test_delete_feature_if_empty_removes_feature(configure_db, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope

    with session_scope() as session:
        feature = create_feature(session, "user-1", "Users")
        session.flush()
        delete_feature_if_empty(session, feature.id, "user-1")
        remaining = session.scalar(select(Feature).where(Feature.id == feature.id))
        assert remaining is None


def test_delete_feature_if_empty_keeps_feature_with_tools(configure_db, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope

    with session_scope() as session:
        feature = create_feature(session, "user-1", "Users")
        session.add(Tool(user_id="user-1", path="/users", method=HttpMethod.get, tool={"function": {"name": "list", "description": "list", "parameters": {}}}, agent_enabled=True, feature_id=feature.id))
        session.flush()
        delete_feature_if_empty(session, feature.id, "user-1")
        remaining = session.scalar(select(Feature).where(Feature.id == feature.id))
        assert remaining is not None


def test_feature_search_escape_like():
    assert _escape_like("a%b_c\\d") == "a\\%b\\_c\\\\d"
