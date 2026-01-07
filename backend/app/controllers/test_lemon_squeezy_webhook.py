import hashlib
import hmac
import importlib
import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


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
def client():
    app = create_app()
    with TestClient(app) as client:
        yield client


def _signature(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def test_webhook_requires_secret(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings

    monkeypatch.delenv("LEMON_SQUEEZY_WEBHOOK_SECRET", raising=False)
    get_settings.cache_clear()
    response = client.post("/webhooks/lemon-squeezy", content=b"{}", headers={"X-Signature": "x"})
    assert response.status_code == 503


def test_webhook_rejects_invalid_signature(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings

    monkeypatch.setenv("LEMON_SQUEEZY_WEBHOOK_SECRET", "secret")
    get_settings.cache_clear()
    response = client.post("/webhooks/lemon-squeezy", content=b"{}", headers={"X-Signature": "bad"})
    assert response.status_code == 401


def test_webhook_rejects_invalid_json(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings

    secret = "secret"
    monkeypatch.setenv("LEMON_SQUEEZY_WEBHOOK_SECRET", secret)
    get_settings.cache_clear()
    raw = b"not-json"
    response = client.post("/webhooks/lemon-squeezy", content=raw, headers={"X-Signature": _signature(secret, raw)})
    assert response.status_code == 400


def test_webhook_processes_valid_payload(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings

    secret = "secret"
    monkeypatch.setenv("LEMON_SQUEEZY_WEBHOOK_SECRET", secret)
    get_settings.cache_clear()

    called = {"value": False}

    def fake_handle(session, settings, payload):
        assert payload["meta"]["event_name"] == "order_created"
        called["value"] = True

    monkeypatch.setattr("app.controllers.lemon_squeezy_webhook.handle_lemon_webhook", fake_handle)

    payload = {"meta": {"event_name": "order_created", "test_mode": True}, "data": {"id": "1", "attributes": {}}}
    raw = json.dumps(payload).encode("utf-8")
    response = client.post("/webhooks/lemon-squeezy", content=raw, headers={"X-Signature": _signature(secret, raw)})
    assert response.status_code == 204
    assert called["value"] is True

