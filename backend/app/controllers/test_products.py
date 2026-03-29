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


def test_list_products_requires_auth(client: TestClient):
    response = client.get("/products")
    assert response.status_code == 401


def test_list_products_proxies_without_limit(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    calls: list[tuple[str, dict | None]] = []

    def fake_get(url, *, params=None, timeout=None, follow_redirects=None):
        calls.append((url, params))
        request = httpx.Request("GET", url)
        return httpx.Response(
            200,
            json={"products": [{"id": 1, "title": "A"}], "total": 1, "skip": 0, "limit": 30},
            request=request,
        )

    monkeypatch.setattr("app.controllers.products.httpx.get", fake_get)

    response = client.get("/products", headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["products"][0]["id"] == 1
    assert calls == [("https://dummyjson.com/products", None)]


def test_list_products_proxies_limit(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    calls: list[tuple[str, dict | None]] = []

    def fake_get(url, *, params=None, timeout=None, follow_redirects=None):
        calls.append((url, params))
        request = httpx.Request("GET", url)
        return httpx.Response(
            200,
            json={"products": [{"id": 1}], "total": 194, "skip": 0, "limit": 5},
            request=request,
        )

    monkeypatch.setattr("app.controllers.products.httpx.get", fake_get)

    response = client.get("/products?limit=5", headers=auth_headers())
    assert response.status_code == 200
    assert calls == [("https://dummyjson.com/products", {"limit": 5})]


def test_upstream_status_error_passed_through(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    def fake_get(url, *, params=None, timeout=None, follow_redirects=None):
        request = httpx.Request("GET", url)
        return httpx.Response(404, json={"error": "nope"}, request=request)

    monkeypatch.setattr("app.controllers.products.httpx.get", fake_get)

    response = client.get("/products", headers=auth_headers())
    assert response.status_code == 404
    assert response.json()["detail"] == "Upstream error"


def test_upstream_request_error_maps_to_502(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    def fake_get(url, *, params=None, timeout=None, follow_redirects=None):
        raise httpx.RequestError("boom", request=httpx.Request("GET", url))

    monkeypatch.setattr("app.controllers.products.httpx.get", fake_get)

    response = client.get("/products", headers=auth_headers())
    assert response.status_code == 502
    assert response.json()["detail"] == "Upstream request failed"
