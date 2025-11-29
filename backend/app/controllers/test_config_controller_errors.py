import importlib

import pytest
from fastapi.testclient import TestClient

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


def test_read_config_handles_error(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.controllers.config.get_config", lambda *_args: (_ for _ in ()).throw(RuntimeError("boom")))
    app = create_app()
    client = TestClient(app)
    response = client.get("/config", headers=auth_headers())
    assert response.status_code == 500

def test_read_config_handles_http_exception(monkeypatch: pytest.MonkeyPatch):
    from fastapi import HTTPException, status
    monkeypatch.setattr("app.controllers.config.get_config", lambda *_args: (_ for _ in ()).throw(HTTPException(status_code=status.HTTP_400_BAD_REQUEST)))
    app = create_app()
    client = TestClient(app)
    response = client.get("/config", headers=auth_headers())
    assert response.status_code == 400


def test_replace_config_handles_error(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.controllers.config.upsert_config", lambda *_args: (_ for _ in ()).throw(RuntimeError("boom")))
    app = create_app()
    client = TestClient(app)
    payload = {"baseUrl": {"local": "http://localhost", "production": "https://api"}, "headers": {}}
    response = client.put("/config", json=payload, headers=auth_headers())
    assert response.status_code == 500
