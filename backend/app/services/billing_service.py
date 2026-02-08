from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.logger import log_info, log_warning
from ..models import BillingAccount, BillingActionConsumption, BillingPlan, BillingTopUpCredit


FREE_LIFETIME_ACTIONS = 250
BASIC_MONTHLY_ACTIONS = 15_000
PRO_MONTHLY_ACTIONS = 60_000


@dataclass(frozen=True)
class BillingActionsSummary:
    plan: BillingPlan
    total_remaining: int
    monthly_remaining: int
    monthly_quota: int
    topup_remaining: int
    lifetime_remaining: int
    is_widget_hidden: bool
    can_manage_subscription: bool
    subscription_status: str | None
    subscription_renews_at: datetime | None


@dataclass(frozen=True)
class BillingActionConsumeResult:
    consumed: int
    remaining: int
    exhausted: bool


def _total_remaining(account: BillingAccount) -> int:
    return (
        int(account.monthly_actions_remaining or 0)
        + int(account.topup_actions_remaining or 0)
        + int(account.lifetime_actions_remaining or 0)
    )


def _consume_one(account: BillingAccount) -> bool:
    if (account.monthly_actions_remaining or 0) > 0:
        account.monthly_actions_remaining -= 1
        return True
    if (account.topup_actions_remaining or 0) > 0:
        account.topup_actions_remaining -= 1
        return True
    if (account.lifetime_actions_remaining or 0) > 0:
        account.lifetime_actions_remaining -= 1
        return True
    return False


def get_or_create_billing_account(session: Session, user_id: str) -> BillingAccount:
    account = session.get(BillingAccount, user_id)
    if account:
        return account
    try:
        with session.begin_nested():
            account = BillingAccount(
                user_id=user_id,
                plan=BillingPlan.free,
                monthly_action_quota=0,
                monthly_actions_remaining=0,
                topup_actions_remaining=0,
                lifetime_actions_remaining=FREE_LIFETIME_ACTIONS,
            )
            session.add(account)
            session.flush()
    except IntegrityError:
        existing = session.get(BillingAccount, user_id)
        if existing:
            return existing
        raise

    log_info("BillingService", "get_or_create_billing_account", "Billing account initialized", user_id=user_id)
    return account


def _get_billing_account_for_update(session: Session, user_id: str) -> BillingAccount:
    account = session.scalar(
        select(BillingAccount)
        .where(BillingAccount.user_id == user_id)
        .with_for_update()
    )
    if account:
        return account
    return get_or_create_billing_account(session, user_id)


def get_billing_actions_summary(session: Session, user_id: str) -> BillingActionsSummary:
    account = get_or_create_billing_account(session, user_id)
    remaining = _total_remaining(account)
    return BillingActionsSummary(
        plan=account.plan,
        total_remaining=remaining,
        monthly_remaining=account.monthly_actions_remaining,
        monthly_quota=account.monthly_action_quota,
        topup_remaining=account.topup_actions_remaining,
        lifetime_remaining=account.lifetime_actions_remaining,
        is_widget_hidden=remaining <= 0,
        can_manage_subscription=bool((account.lemon_subscription_id or "").strip()),
        subscription_status=(account.lemon_subscription_status or None),
        subscription_renews_at=account.lemon_subscription_renews_at,
    )


def consume_actions_for_tool_results(
    session: Session,
    user_id: str,
    conversation_id: UUID,
    tool_call_ids: list[str],
) -> BillingActionConsumeResult:
    unique_tool_call_ids = list(dict.fromkeys([item for item in tool_call_ids if item]))
    if not unique_tool_call_ids:
        account = get_or_create_billing_account(session, user_id)
        remaining = _total_remaining(account)
        return BillingActionConsumeResult(consumed=0, remaining=remaining, exhausted=remaining <= 0)

    account = _get_billing_account_for_update(session, user_id)
    existing = set(session.scalars(
        select(BillingActionConsumption.tool_call_id).where(
            BillingActionConsumption.user_id == user_id,
            BillingActionConsumption.conversation_id == conversation_id,
            BillingActionConsumption.tool_call_id.in_(unique_tool_call_ids),
        )
    ).all())

    consumed = 0
    for tool_call_id in unique_tool_call_ids:
        if tool_call_id in existing:
            continue
        if not _consume_one(account):
            break
        session.add(BillingActionConsumption(
            user_id=user_id,
            conversation_id=conversation_id,
            tool_call_id=tool_call_id,
        ))
        consumed += 1

    remaining = _total_remaining(account)
    if consumed:
        log_info(
            "BillingService",
            "consume_actions_for_tool_results",
            "Actions consumed",
            user_id=user_id,
            consumed=consumed,
            remaining=remaining,
        )
    return BillingActionConsumeResult(consumed=consumed, remaining=remaining, exhausted=remaining <= 0)


def consume_action_for_server_execution(session: Session, user_id: str) -> BillingActionConsumeResult:
    account = _get_billing_account_for_update(session, user_id)
    consumed = 1 if _consume_one(account) else 0
    remaining = _total_remaining(account)
    return BillingActionConsumeResult(consumed=consumed, remaining=remaining, exhausted=remaining <= 0)


def credit_topup_actions(
    session: Session,
    user_id: str,
    lemon_order_id: str,
    actions: int,
) -> int:
    if actions <= 0:
        return 0

    account = _get_billing_account_for_update(session, user_id)
    credited = 0
    try:
        with session.begin_nested():
            session.add(BillingTopUpCredit(user_id=user_id, lemon_order_id=lemon_order_id, actions=actions))
            session.flush()
            account.topup_actions_remaining += actions
            credited = actions
    except IntegrityError:
        log_warning(
            "BillingService",
            "credit_topup_actions",
            "Top-up already processed",
            user_id=user_id,
            lemon_order_id=lemon_order_id,
        )
        return 0

    if credited:
        log_info(
            "BillingService",
            "credit_topup_actions",
            "Top-up credited",
            user_id=user_id,
            lemon_order_id=lemon_order_id,
            actions=credited,
            remaining=_total_remaining(account),
        )
    return credited


def refund_topup_actions(session: Session, lemon_order_id: str) -> int:
    credit = session.scalar(
        select(BillingTopUpCredit)
        .where(BillingTopUpCredit.lemon_order_id == lemon_order_id)
        .with_for_update()
    )
    if not credit:
        return 0
    if credit.refunded_at is not None:
        return 0

    account = _get_billing_account_for_update(session, credit.user_id)
    reclaimable = max(min(account.topup_actions_remaining, credit.actions), 0)
    account.topup_actions_remaining -= reclaimable
    credit.refunded_at = datetime.now(tz=UTC)
    log_info(
        "BillingService",
        "refund_topup_actions",
        "Top-up refunded",
        user_id=credit.user_id,
        lemon_order_id=lemon_order_id,
        reclaimed=reclaimable,
        remaining=_total_remaining(account),
    )
    return reclaimable


def is_subscription_entitled(status: str | None, ends_at: datetime | None) -> bool:
    normalized = (status or "").strip().lower()
    if normalized not in {"active", "on_trial"}:
        return False
    if not ends_at:
        return True
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=UTC)
    return ends_at > datetime.now(tz=UTC)


def apply_subscription_update(
    session: Session,
    user_id: str,
    *,
    plan: BillingPlan,
    monthly_quota: int,
    subscription_status: str | None,
    subscription_variant_id: str | None,
    customer_id: str | None,
    subscription_id: str | None,
    renews_at: datetime | None,
    ends_at: datetime | None,
    entitled: bool,
) -> BillingAccount:
    account = _get_billing_account_for_update(session, user_id)
    previous_quota = int(account.monthly_action_quota or 0)
    previous_renews_at = account.lemon_subscription_renews_at
    previous_variant_id = account.lemon_subscription_variant_id

    account.lemon_customer_id = customer_id or account.lemon_customer_id
    account.lemon_subscription_id = subscription_id or account.lemon_subscription_id
    account.lemon_subscription_status = subscription_status
    account.lemon_subscription_variant_id = subscription_variant_id
    account.lemon_subscription_renews_at = renews_at
    account.lemon_subscription_ends_at = ends_at

    if not entitled:
        account.plan = BillingPlan.free
        account.monthly_action_quota = 0
        account.monthly_actions_remaining = 0
        return account

    next_quota = max(int(monthly_quota), 0)
    account.plan = plan
    account.monthly_action_quota = next_quota

    renewed = (
        renews_at is not None
        and previous_renews_at is not None
        and renews_at != previous_renews_at
        and renews_at > previous_renews_at
    )
    if account.lemon_subscription_id and not previous_renews_at:
        renewed = True

    if renewed:
        account.monthly_actions_remaining = next_quota
        return account

    if subscription_variant_id and previous_variant_id and subscription_variant_id != previous_variant_id:
        delta = next_quota - previous_quota
        account.monthly_actions_remaining = max(min(account.monthly_actions_remaining + delta, next_quota), 0)
        return account

    if previous_quota != next_quota:
        delta = next_quota - previous_quota
        account.monthly_actions_remaining = max(min(account.monthly_actions_remaining + delta, next_quota), 0)
        return account

    account.monthly_actions_remaining = min(account.monthly_actions_remaining, next_quota)
    return account
