import importlib

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.main import create_app
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


def auth_headers():
    return {"Authorization": "Bearer token"}


def test_get_agent_404_when_missing():
    app = create_app()
    client = TestClient(app)
    response = client.get("/agent", headers=auth_headers())
    assert response.status_code == 404


def test_create_conversation_without_agent(monkeypatch: pytest.MonkeyPatch):
    app = create_app()
    client = TestClient(app)
    monkeypatch.setattr("app.controllers.agent.get_agent", lambda session, user_id: None)
    response = client.post("/agent/conversations", json={"participant": "user"}, headers=auth_headers())
    assert response.status_code == 404


def test_chat_handles_missing_conversation(monkeypatch: pytest.MonkeyPatch):
    app = create_app()
    client = TestClient(app)
    monkeypatch.setattr("app.controllers.agent.get_conversation", lambda *_args, **_kwargs: None)
    response = client.post("/agent/conversations/00000000-0000-0000-0000-000000000000", json={"message": "hi"}, headers=auth_headers())
    assert response.status_code == 404


def test_chat_handles_executor_error(monkeypatch: pytest.MonkeyPatch):
    from app.services.agent_service import create_agent, create_conversation
    from app.core.database import session_scope

    class BoomExecutor:
        def __init__(self, *_args, **_kwargs):
            pass

        async def run(self, *_args, **_kwargs):
            raise RuntimeError("boom")

    monkeypatch.setattr("app.controllers.agent.AgentExecutor", BoomExecutor)
    app = create_app()
    client = TestClient(app)
    with session_scope() as session:
        agent = create_agent(session, "user_1")
        convo = create_conversation(session, agent.id, "user")
        convo_id = str(convo.id)
    response = client.post(f"/agent/conversations/{convo_id}", json={"message": "hi"}, headers=auth_headers())
    assert response.status_code == 500


def test_agent_routes_handle_generic_errors(monkeypatch: pytest.MonkeyPatch):
    app = create_app()
    client = TestClient(app)

    monkeypatch.setattr("app.controllers.agent.create_agent", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("x")))
    assert client.post("/agent", headers=auth_headers()).status_code == 500

    monkeypatch.setattr("app.controllers.agent.get_agent", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("x")))
    assert client.get("/agent", headers=auth_headers()).status_code == 500

    monkeypatch.setattr("app.controllers.agent.list_conversations", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("x")))
    assert client.get("/agent/conversations", headers=auth_headers()).status_code == 500

    monkeypatch.setattr("app.controllers.agent.get_conversation", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("x")))
    assert client.get("/agent/conversations/00000000-0000-0000-0000-000000000000", headers=auth_headers()).status_code == 500


def test_agent_routes_handle_http_exceptions(monkeypatch: pytest.MonkeyPatch):
    from fastapi import HTTPException, status
    app = create_app()
    client = TestClient(app)
    monkeypatch.setattr("app.controllers.agent.create_agent", lambda *_a, **_k: (_ for _ in ()).throw(HTTPException(status_code=status.HTTP_409_CONFLICT)))
    assert client.post("/agent", headers=auth_headers()).status_code == 409
    monkeypatch.setattr("app.controllers.agent.get_agent", lambda *_a, **_k: (_ for _ in ()).throw(HTTPException(status_code=status.HTTP_400_BAD_REQUEST)))
    assert client.get("/agent/conversations", headers=auth_headers()).status_code == 400


def test_list_conversations_404_when_no_agent():
    app = create_app()
    client = TestClient(app)
    response = client.get("/agent/conversations", headers=auth_headers())
    assert response.status_code == 404


def test_create_conversation_unexpected_error(monkeypatch: pytest.MonkeyPatch):
    app = create_app()
    client = TestClient(app)
    monkeypatch.setattr("app.controllers.agent.get_agent", lambda *_a, **_k: type("A", (), {"id": "x"})())
    monkeypatch.setattr("app.controllers.agent.create_conversation", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("boom")))
    response = client.post("/agent/conversations", json={"participant": "x"}, headers=auth_headers())
    assert response.status_code == 500


def test_get_conversation_unexpected_error(monkeypatch: pytest.MonkeyPatch):
    app = create_app()
    client = TestClient(app)
    monkeypatch.setattr("app.controllers.agent.get_conversation", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("boom")))
    response = client.get("/agent/conversations/00000000-0000-0000-0000-000000000000", headers=auth_headers())
    assert response.status_code == 500


def test_get_conversation_not_found():
    app = create_app()
    client = TestClient(app)
    response = client.get("/agent/conversations/00000000-0000-0000-0000-000000000001", headers=auth_headers())
    assert response.status_code == 404
