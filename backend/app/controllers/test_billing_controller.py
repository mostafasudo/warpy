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
    monkeypatch.setenv("LEMON_SQUEEZY_API_KEY", "")
    monkeypatch.setenv("LEMON_SQUEEZY_STORE_ID", "")
    monkeypatch.setenv("LEMON_SQUEEZY_WEBHOOK_SECRET", "")
    monkeypatch.setenv("LEMON_SQUEEZY_BASIC_VARIANT_ID", "")
    monkeypatch.setenv("LEMON_SQUEEZY_PRO_VARIANT_ID", "")
    monkeypatch.setenv("LEMON_SQUEEZY_ENTERPRISE_VARIANT_ID", "")
    monkeypatch.setenv("LEMON_SQUEEZY_TOPUP_1000_VARIANT_ID", "")
    monkeypatch.setenv("LEMON_SQUEEZY_TOPUP_5000_VARIANT_ID", "")
    monkeypatch.setenv("LEMON_SQUEEZY_TOPUP_10000_VARIANT_ID", "")
    monkeypatch.setenv("LEMON_SQUEEZY_REDIRECT_URL", "")
    monkeypatch.setenv("LEMON_SQUEEZY_TEST_MODE", "false")
    monkeypatch.setenv("BILLING_ADMIN_TOKEN", "")
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
    with TestClient(app) as client:
        yield client


def auth_headers():
    return {"Authorization": "Bearer token"}


def test_billing_summary_defaults_to_free(client: TestClient):
    response = client.get("/billing", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["plan"] == "free"
    assert data["actionsRemaining"] == 250
    assert data["isWidgetHidden"] is False
    assert data["canManageSubscription"] is False


def test_subscription_checkout_requires_configuration(client: TestClient):
    response = client.post("/billing/checkout/subscription", headers=auth_headers(), json={"plan": "basic"})
    assert response.status_code == 503


def test_creates_subscription_checkout_when_configured(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings

    monkeypatch.setenv("LEMON_SQUEEZY_BASIC_VARIANT_ID", "11")
    get_settings.cache_clear()

    async def fake_create_checkout(settings, *, variant_id, user_id, custom_data, custom_price_cents=None):
        assert variant_id == "11"
        assert user_id == "user_1"
        assert custom_data["plan"] == "basic"
        return "https://checkout.test/basic"

    monkeypatch.setattr("app.controllers.billing.create_checkout", fake_create_checkout)

    response = client.post("/billing/checkout/subscription", headers=auth_headers(), json={"plan": "basic"})
    assert response.status_code == 200
    assert response.json()["url"] == "https://checkout.test/basic"


def test_subscription_checkout_returns_lemon_error_details(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings
    from app.services.lemon_squeezy_service import LemonSqueezyApiError

    monkeypatch.setenv("LEMON_SQUEEZY_BASIC_VARIANT_ID", "11")
    get_settings.cache_clear()

    async def fake_create_checkout(*_args, **_kwargs):
        raise LemonSqueezyApiError(422, "Lemon Squeezy returned 422: Variant is invalid")

    monkeypatch.setattr("app.controllers.billing.create_checkout", fake_create_checkout)

    response = client.post("/billing/checkout/subscription", headers=auth_headers(), json={"plan": "basic"})
    assert response.status_code == 502
    assert response.json()["detail"] == "Lemon Squeezy returned 422: Variant is invalid"


def test_creates_topup_checkout_when_configured(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings

    monkeypatch.setenv("LEMON_SQUEEZY_TOPUP_5000_VARIANT_ID", "105")
    get_settings.cache_clear()

    async def fake_create_checkout(settings, *, variant_id, user_id, custom_data, custom_price_cents=None):
        assert variant_id == "105"
        assert custom_data["topup_actions"] == 5000
        return "https://checkout.test/topup"

    monkeypatch.setattr("app.controllers.billing.create_checkout", fake_create_checkout)

    response = client.post("/billing/checkout/topup", headers=auth_headers(), json={"package": "5000"})
    assert response.status_code == 200
    assert response.json()["url"] == "https://checkout.test/topup"


def test_portal_returns_not_found_without_subscription(client: TestClient):
    response = client.post("/billing/portal", headers=auth_headers())
    assert response.status_code == 404


def test_portal_returns_url_when_subscription_exists(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope

    from app.services.billing_service import get_or_create_billing_account

    with session_scope() as session:
        account = get_or_create_billing_account(session, "user_1")
        account.lemon_subscription_id = "sub_1"
        session.flush()

    async def fake_portal(settings, subscription_id):
        assert subscription_id == "sub_1"
        return "https://portal.test"

    monkeypatch.setattr("app.controllers.billing.get_customer_portal_url", fake_portal)

    response = client.post("/billing/portal", headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["url"] == "https://portal.test"


def test_enterprise_checkout_requires_admin_token(client: TestClient):
    response = client.post(
        "/billing/checkout/enterprise",
        headers=auth_headers(),
        json={"customPriceCents": 10000, "monthlyActions": 12345},
    )
    assert response.status_code == 503


def test_enterprise_checkout_validates_admin_token(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings

    monkeypatch.setenv("BILLING_ADMIN_TOKEN", "admin")
    monkeypatch.setenv("LEMON_SQUEEZY_ENTERPRISE_VARIANT_ID", "33")
    get_settings.cache_clear()

    async def fake_create_checkout(settings, *, variant_id, user_id, custom_data, custom_price_cents=None):
        assert variant_id == "33"
        assert custom_data["plan"] == "enterprise"
        assert custom_price_cents == 10000
        return "https://checkout.test/enterprise"

    monkeypatch.setattr("app.controllers.billing.create_checkout", fake_create_checkout)

    forbidden = client.post(
        "/billing/checkout/enterprise",
        headers={**auth_headers(), "x-warpy-admin-token": "nope"},
        json={"customPriceCents": 10000, "monthlyActions": 12345},
    )
    assert forbidden.status_code == 403

    ok = client.post(
        "/billing/checkout/enterprise",
        headers={**auth_headers(), "x-warpy-admin-token": "admin"},
        json={"customPriceCents": 10000, "monthlyActions": 12345},
    )
    assert ok.status_code == 200
    assert ok.json()["url"] == "https://checkout.test/enterprise"
