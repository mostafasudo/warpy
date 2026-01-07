import importlib
import asyncio

import pytest

from app.core import database
from app.core.config import get_settings
from app.models import Base, BillingAccount, BillingPlan
from app.services.lemon_squeezy_service import (
    LemonSqueezyApiError,
    create_checkout,
    get_customer_portal_url,
    handle_lemon_webhook,
    verify_lemon_webhook_signature,
)


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


class DummySettings:
    lemon_squeezy_api_key = "ls_test"
    lemon_squeezy_store_id = "1"
    lemon_squeezy_redirect_url = ""
    lemon_squeezy_test_mode = False
    lemon_squeezy_basic_variant_id = "11"
    lemon_squeezy_pro_variant_id = "22"
    lemon_squeezy_enterprise_variant_id = "33"
    lemon_squeezy_topup_1000_variant_id = "101"
    lemon_squeezy_topup_5000_variant_id = "105"
    lemon_squeezy_topup_10000_variant_id = "110"


def test_verify_webhook_signature_matches():
    secret = "secret"
    raw = b'{"ping":"pong"}'
    assert verify_lemon_webhook_signature(secret, raw, None) is False

    import hashlib, hmac
    signature = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    assert verify_lemon_webhook_signature(secret, raw, signature) is True
    assert verify_lemon_webhook_signature(secret, raw, "bad") is False


def test_handle_subscription_webhook_updates_billing_account():
    from app.core.database import session_scope

    payload = {
        "meta": {"event_name": "subscription_created", "custom_data": {"user_id": "user-1"}},
        "data": {
            "id": "sub-1",
            "attributes": {
                "customer_id": 99,
                "variant_id": 11,
                "status": "active",
                "renews_at": "2099-01-01T00:00:00.000000Z",
                "ends_at": None,
            },
        },
    }
    with session_scope() as session:
        handle_lemon_webhook(session, DummySettings(), payload)
        account = session.get(BillingAccount, "user-1")
        assert account.plan == BillingPlan.basic
        assert account.monthly_action_quota == 15000
        assert account.monthly_actions_remaining == 15000
        assert account.lemon_subscription_id == "sub-1"


def test_handle_topup_order_created_and_refunded():
    from app.core.database import session_scope

    created = {
        "meta": {"event_name": "order_created", "custom_data": {"user_id": "user-1"}},
        "data": {
            "id": "order-1",
            "attributes": {
                "customer_id": 99,
                "first_order_item": {"variant_id": 101},
            },
        },
    }
    refunded = {
        "meta": {"event_name": "order_refunded", "custom_data": {"user_id": "user-1"}},
        "data": {
            "id": "order-1",
            "attributes": {
                "customer_id": 99,
                "first_order_item": {"variant_id": 101},
            },
        },
    }

    with session_scope() as session:
        handle_lemon_webhook(session, DummySettings(), created)
        account = session.get(BillingAccount, "user-1")
        assert account.topup_actions_remaining == 1000

        handle_lemon_webhook(session, DummySettings(), refunded)
        account = session.get(BillingAccount, "user-1")
        assert account.topup_actions_remaining == 0


def test_resolves_user_from_customer_id_when_custom_data_missing():
    from app.core.database import session_scope

    payload = {
        "meta": {"event_name": "subscription_updated", "custom_data": {}},
        "data": {
            "id": "sub-1",
            "attributes": {
                "customer_id": 77,
                "variant_id": 22,
                "status": "active",
                "renews_at": "2099-01-01T00:00:00.000000Z",
                "ends_at": None,
            },
        },
    }

    with session_scope() as session:
        account = BillingAccount(
            user_id="user-1",
            plan=BillingPlan.free,
            monthly_action_quota=0,
            monthly_actions_remaining=0,
            topup_actions_remaining=0,
            lifetime_actions_remaining=500,
            lemon_customer_id="77",
        )
        session.add(account)
        session.flush()
        handle_lemon_webhook(session, DummySettings(), payload)
        refreshed = session.get(BillingAccount, "user-1")
        assert refreshed.plan == BillingPlan.pro


def test_create_checkout_and_portal_url(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload
        def raise_for_status(self):
            return None
        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, *_args, **_kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc, tb):
            return False
        async def post(self, *_args, **_kwargs):
            captured["post_kwargs"] = _kwargs
            return FakeResponse({"data": {"attributes": {"url": "https://checkout.test"}}})
        async def get(self, *_args, **_kwargs):
            return FakeResponse({"data": {"attributes": {"urls": {"customer_portal": "https://portal.test"}}}})

    from app.services import lemon_squeezy_service

    monkeypatch.setattr(lemon_squeezy_service.httpx, "AsyncClient", FakeClient)

    settings = DummySettings()
    url = asyncio.run(create_checkout(settings, variant_id="11", user_id="user-1", custom_data={"plan": "basic", "monthly_actions": 15000}))
    assert url == "https://checkout.test"

    post_kwargs = captured.get("post_kwargs")
    assert isinstance(post_kwargs, dict)
    assert isinstance(post_kwargs.get("content"), str)
    body = __import__("json").loads(post_kwargs["content"])
    custom = body["data"]["attributes"]["checkout_data"]["custom"]
    assert custom["user_id"] == "user-1"
    assert custom["monthly_actions"] == "15000"

    portal = asyncio.run(get_customer_portal_url(settings, "sub-1"))
    assert portal == "https://portal.test"


def test_create_checkout_requires_config():
    class EmptySettings:
        lemon_squeezy_api_key = ""
        lemon_squeezy_store_id = ""
        lemon_squeezy_redirect_url = ""
        lemon_squeezy_test_mode = False

    with pytest.raises(ValueError):
        asyncio.run(create_checkout(EmptySettings(), variant_id="11", user_id="user-1", custom_data={}))


def test_create_checkout_surfaces_lemon_errors(monkeypatch: pytest.MonkeyPatch):
    import httpx

    request = httpx.Request("POST", "https://api.lemonsqueezy.com/v1/checkouts")
    response = httpx.Response(
        422,
        request=request,
        json={"errors": [{"title": "Unprocessable", "detail": "Variant is invalid"}]},
    )

    class FakeClient:
        def __init__(self, *_args, **_kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc, tb):
            return False
        async def post(self, *_args, **_kwargs):
            return response

    from app.services import lemon_squeezy_service

    monkeypatch.setattr(lemon_squeezy_service.httpx, "AsyncClient", FakeClient)

    with pytest.raises(LemonSqueezyApiError) as error:
        asyncio.run(create_checkout(DummySettings(), variant_id="11", user_id="user-1", custom_data={}))
    assert "Lemon Squeezy returned 422" in str(error.value)
