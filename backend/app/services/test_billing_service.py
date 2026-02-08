import importlib
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.core import database
from app.core.config import get_settings
from app.models import Base, BillingAccount, BillingPlan
from app.services.billing_service import (
    apply_subscription_update,
    consume_actions_for_tool_results,
    credit_topup_actions,
    get_or_create_billing_account,
    is_subscription_entitled,
    refund_topup_actions,
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


def test_get_or_create_billing_account_initializes_free_plan():
    from app.core.database import session_scope

    with session_scope() as session:
        account = get_or_create_billing_account(session, "user-1")
        assert account.plan == BillingPlan.free
        assert account.lifetime_actions_remaining == 250
        assert account.monthly_actions_remaining == 0
        assert account.topup_actions_remaining == 0


def test_consume_actions_for_tool_results_is_idempotent():
    from app.core.database import session_scope

    conversation_id = uuid4()
    with session_scope() as session:
        account = get_or_create_billing_account(session, "user-1")
        account.lifetime_actions_remaining = 2
        session.flush()

        first = consume_actions_for_tool_results(session, "user-1", conversation_id, ["call-1", "call-1", "call-2"])
        assert first.consumed == 2
        assert first.remaining == 0
        assert first.exhausted is True

        second = consume_actions_for_tool_results(session, "user-1", conversation_id, ["call-1", "call-2"])
        assert second.consumed == 0
        assert second.remaining == 0


def test_credit_and_refund_topups_are_idempotent():
    from app.core.database import session_scope

    with session_scope() as session:
        account = get_or_create_billing_account(session, "user-1")
        account.lifetime_actions_remaining = 0
        session.flush()

        credited = credit_topup_actions(session, "user-1", "order-1", 1000)
        assert credited == 1000
        assert session.get(BillingAccount, "user-1").topup_actions_remaining == 1000

        credited_again = credit_topup_actions(session, "user-1", "order-1", 1000)
        assert credited_again == 0
        assert session.get(BillingAccount, "user-1").topup_actions_remaining == 1000

        reclaimed = refund_topup_actions(session, "order-1")
        assert reclaimed == 1000
        assert session.get(BillingAccount, "user-1").topup_actions_remaining == 0

        reclaimed_again = refund_topup_actions(session, "order-1")
        assert reclaimed_again == 0


def test_apply_subscription_update_resets_on_renewal_and_adjusts_quota():
    from app.core.database import session_scope

    with session_scope() as session:
        account = get_or_create_billing_account(session, "user-1")
        account.plan = BillingPlan.basic
        account.monthly_action_quota = 10
        account.monthly_actions_remaining = 3
        account.lemon_subscription_id = "sub-1"
        account.lemon_subscription_variant_id = "v1"
        account.lemon_subscription_renews_at = datetime.now(tz=UTC)
        session.flush()

        later = datetime.now(tz=UTC) + timedelta(days=30)
        apply_subscription_update(
            session,
            "user-1",
            plan=BillingPlan.basic,
            monthly_quota=10,
            subscription_status="active",
            subscription_variant_id="v1",
            customer_id="cust-1",
            subscription_id="sub-1",
            renews_at=later,
            ends_at=None,
            entitled=True,
        )
        refreshed = session.get(BillingAccount, "user-1")
        assert refreshed.monthly_actions_remaining == 10

        apply_subscription_update(
            session,
            "user-1",
            plan=BillingPlan.pro,
            monthly_quota=20,
            subscription_status="active",
            subscription_variant_id="v2",
            customer_id="cust-1",
            subscription_id="sub-1",
            renews_at=later,
            ends_at=None,
            entitled=True,
        )
        refreshed = session.get(BillingAccount, "user-1")
        assert refreshed.plan == BillingPlan.pro
        assert refreshed.monthly_action_quota == 20
        assert refreshed.monthly_actions_remaining == 20


def test_is_subscription_entitled_requires_active_status_and_future_ends_at():
    assert is_subscription_entitled("active", None) is True
    assert is_subscription_entitled("on_trial", None) is True
    assert is_subscription_entitled("cancelled", None) is False

    past = datetime.now(tz=UTC) - timedelta(seconds=1)
    future = datetime.now(tz=UTC) + timedelta(seconds=1)
    assert is_subscription_entitled("active", past) is False
    assert is_subscription_entitled("active", future) is True
