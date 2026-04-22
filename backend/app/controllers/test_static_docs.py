import importlib

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch: pytest.MonkeyPatch):
    from app.core import database
    from app.core.config import get_settings

    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test")
    monkeypatch.setenv("WIDGET_JWT_SECRET", "secret")
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


def test_integrate_warpy_markdown_is_public_and_detailed(client: TestClient):
    response = client.get("/static/integrate-warpy.md")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    body = response.text

    assert "single source of truth for agents" in body
    assert "All state-changing actions must use the same control-plane API the dashboard uses." in body
    assert "## Start Here: Install The Widget First" in body
    assert "## Drift Detection Workflow" in body
    assert "`GET /api-key`" in body
    assert "`POST /api-key/rotate`" in body
    assert "`window.warpy(name, vars)`" in body
    assert "/activity/summary" not in body
    assert "/billing" not in body
