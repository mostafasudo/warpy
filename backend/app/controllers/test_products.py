import importlib

import httpx
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


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def auth_headers():
    return {"Authorization": "Bearer token"}


def test_get_product_requires_auth(client: TestClient):
    response = client.get("/products/1")
    assert response.status_code == 401


def test_get_product_proxies_id(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    calls: list[str] = []

    def fake_get(url, *, timeout=None, follow_redirects=None):
        calls.append(url)
        request = httpx.Request("GET", url)
        return httpx.Response(200, json={"id": 1, "title": "A", "image": "https://img.test/a.jpg"}, request=request)

    monkeypatch.setattr("app.controllers.products.httpx.get", fake_get)

    response = client.get("/products/1", headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert calls == ["https://fakestoreapi.com/products/1"]


def test_upstream_status_error_passed_through(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    def fake_get(url, *, timeout=None, follow_redirects=None):
        request = httpx.Request("GET", url)
        return httpx.Response(404, json={"error": "nope"}, request=request)

    monkeypatch.setattr("app.controllers.products.httpx.get", fake_get)

    response = client.get("/products/999", headers=auth_headers())
    assert response.status_code == 404
    assert response.json()["detail"] == "Upstream error"


def test_upstream_request_error_maps_to_502(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    def fake_get(url, *, timeout=None, follow_redirects=None):
        raise httpx.RequestError("boom", request=httpx.Request("GET", url))

    monkeypatch.setattr("app.controllers.products.httpx.get", fake_get)

    response = client.get("/products/1", headers=auth_headers())
    assert response.status_code == 502
    assert response.json()["detail"] == "Upstream request failed"
