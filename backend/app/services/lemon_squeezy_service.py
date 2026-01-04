import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..core.logger import log_info, log_warning
from ..models import BillingAccount, BillingPlan
from .billing_service import (
    BASIC_MONTHLY_ACTIONS,
    PRO_MONTHLY_ACTIONS,
    apply_subscription_update,
    credit_topup_actions,
    is_subscription_entitled,
    refund_topup_actions,
)


LEMON_API_BASE = "https://api.lemonsqueezy.com/v1"
LEMON_TIMEOUT = httpx.Timeout(15.0, connect=5.0)


class LemonSqueezyApiError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = int(status_code)
        self.message = message
        super().__init__(message)


def verify_lemon_webhook_signature(secret: str, raw_body: bytes, signature: str | None) -> bool:
    if not secret or not signature:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except Exception:
        return None


def _parse_positive_int(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return max(value, 0)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return 0


def _resolve_user_id(session: Session, custom_data: dict[str, Any] | None, lemon_customer_id: Any) -> str | None:
    if custom_data and isinstance(custom_data, dict):
        user_id = custom_data.get("user_id") or custom_data.get("userId")
        if isinstance(user_id, str) and user_id.strip():
            return user_id.strip()
    if lemon_customer_id is None:
        return None
    customer_id = str(lemon_customer_id).strip()
    if not customer_id:
        return None
    account = session.scalar(select(BillingAccount).where(BillingAccount.lemon_customer_id == customer_id).limit(1))
    return account.user_id if account else None


def _subscription_plan_and_quota(settings: Settings, variant_id: str, custom_data: dict[str, Any] | None) -> tuple[BillingPlan, int]:
    if settings.lemon_squeezy_basic_variant_id and variant_id == settings.lemon_squeezy_basic_variant_id:
        return BillingPlan.basic, BASIC_MONTHLY_ACTIONS
    if settings.lemon_squeezy_pro_variant_id and variant_id == settings.lemon_squeezy_pro_variant_id:
        return BillingPlan.pro, PRO_MONTHLY_ACTIONS
    if settings.lemon_squeezy_enterprise_variant_id and variant_id == settings.lemon_squeezy_enterprise_variant_id:
        return BillingPlan.enterprise, _parse_positive_int((custom_data or {}).get("monthly_actions"))

    plan = (custom_data or {}).get("plan")
    if isinstance(plan, str):
        normalized = plan.strip().lower()
        if normalized == "basic":
            return BillingPlan.basic, BASIC_MONTHLY_ACTIONS
        if normalized == "pro":
            return BillingPlan.pro, PRO_MONTHLY_ACTIONS
        if normalized == "enterprise":
            return BillingPlan.enterprise, _parse_positive_int((custom_data or {}).get("monthly_actions"))

    log_warning(
        "LemonSqueezyService",
        "_subscription_plan_and_quota",
        "Unknown subscription variant",
        variant_id=variant_id,
    )
    return BillingPlan.free, 0


def _topup_actions_for_variant(settings: Settings, variant_id: str) -> int:
    if settings.lemon_squeezy_topup_1000_variant_id and variant_id == settings.lemon_squeezy_topup_1000_variant_id:
        return 1_000
    if settings.lemon_squeezy_topup_5000_variant_id and variant_id == settings.lemon_squeezy_topup_5000_variant_id:
        return 5_000
    if settings.lemon_squeezy_topup_10000_variant_id and variant_id == settings.lemon_squeezy_topup_10000_variant_id:
        return 10_000
    return 0


def handle_lemon_webhook(session: Session, settings: Settings, payload: dict[str, Any]) -> None:
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    event_name = meta.get("event_name") if isinstance(meta.get("event_name"), str) else ""
    custom_data = meta.get("custom_data") if isinstance(meta.get("custom_data"), dict) else {}
    attributes = data.get("attributes") if isinstance(data.get("attributes"), dict) else {}

    if not event_name:
        log_warning("LemonSqueezyService", "handle_lemon_webhook", "Missing event_name")
        return

    if event_name.startswith("subscription_"):
        lemon_subscription_id = str(data.get("id") or "").strip() or None
        lemon_customer_id = attributes.get("customer_id")
        user_id = _resolve_user_id(session, custom_data, lemon_customer_id)
        if not user_id:
            log_warning(
                "LemonSqueezyService",
                "handle_lemon_webhook",
                "Unable to resolve user for subscription event",
                event_name=event_name,
                lemon_subscription_id=lemon_subscription_id or "",
            )
            return

        status = attributes.get("status")
        variant_id = str(attributes.get("variant_id") or "").strip()
        renews_at = _parse_datetime(attributes.get("renews_at"))
        ends_at = _parse_datetime(attributes.get("ends_at"))
        entitled = is_subscription_entitled(str(status or ""), ends_at)
        plan, quota = _subscription_plan_and_quota(settings, variant_id, custom_data)
        apply_subscription_update(
            session,
            user_id,
            plan=plan,
            monthly_quota=quota,
            subscription_status=str(status or "") or None,
            subscription_variant_id=variant_id or None,
            customer_id=str(lemon_customer_id or "").strip() or None,
            subscription_id=lemon_subscription_id,
            renews_at=renews_at,
            ends_at=ends_at,
            entitled=entitled,
        )
        log_info(
            "LemonSqueezyService",
            "handle_lemon_webhook",
            "Subscription updated",
            user_id=user_id,
            event_name=event_name,
            plan=plan.value,
            entitled=entitled,
        )
        return

    if event_name in {"order_created", "order_refunded"}:
        lemon_order_id = str(data.get("id") or "").strip()
        if not lemon_order_id:
            log_warning("LemonSqueezyService", "handle_lemon_webhook", "Order event missing id", event_name=event_name)
            return
        first_item = attributes.get("first_order_item") if isinstance(attributes.get("first_order_item"), dict) else {}
        variant_id = str(first_item.get("variant_id") or "").strip()
        lemon_customer_id = attributes.get("customer_id")
        user_id = _resolve_user_id(session, custom_data, lemon_customer_id)
        if not user_id:
            log_warning(
                "LemonSqueezyService",
                "handle_lemon_webhook",
                "Unable to resolve user for order event",
                event_name=event_name,
                lemon_order_id=lemon_order_id,
            )
            return
        topup_actions = _topup_actions_for_variant(settings, variant_id)
        if topup_actions <= 0:
            return

        if event_name == "order_refunded":
            refund_topup_actions(session, lemon_order_id)
            return

        credit_topup_actions(session, user_id, lemon_order_id, topup_actions)
        return

    log_info(
        "LemonSqueezyService",
        "handle_lemon_webhook",
        "Event ignored",
        event_name=event_name,
    )


def _require_lemon_api_key(settings: Settings) -> str:
    key = settings.lemon_squeezy_api_key.strip()
    if not key:
        raise ValueError("LEMON_SQUEEZY_API_KEY missing")
    return key


def _require_store_id(settings: Settings) -> str:
    store_id = settings.lemon_squeezy_store_id.strip()
    if not store_id:
        raise ValueError("LEMON_SQUEEZY_STORE_ID missing")
    return store_id


def _normalize_checkout_custom_data(custom_data: dict[str, Any]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for key, value in custom_data.items():
        if value is None:
            continue
        if isinstance(value, str):
            normalized[str(key)] = value
            continue
        if isinstance(value, bool):
            normalized[str(key)] = "true" if value else "false"
            continue
        if isinstance(value, (int, float)):
            normalized[str(key)] = str(value)
            continue
        normalized[str(key)] = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    return normalized


def _format_lemon_error(response: httpx.Response) -> str:
    details: str | None = None
    try:
        payload = response.json()
        if isinstance(payload, dict):
            errors = payload.get("errors")
            if isinstance(errors, list):
                parts: list[str] = []
                for item in errors[:3]:
                    if not isinstance(item, dict):
                        continue
                    source = item.get("source")
                    pointer = ""
                    if isinstance(source, dict):
                        raw_pointer = source.get("pointer") or source.get("parameter")
                        if isinstance(raw_pointer, str) and raw_pointer.strip():
                            pointer = raw_pointer.strip()
                    title = item.get("title")
                    detail = item.get("detail")
                    code = item.get("code")
                    message = title.strip() if isinstance(title, str) else ""
                    if isinstance(detail, str) and detail.strip():
                        message = f"{message}: {detail.strip()}" if message else detail.strip()
                    if not message and isinstance(code, str) and code.strip():
                        message = code.strip()
                    if pointer and message:
                        message = f"{pointer}: {message}"
                    elif pointer:
                        message = pointer
                    if message:
                        parts.append(message)
                if parts:
                    details = " | ".join(parts)
            if not details:
                detail = payload.get("detail")
                if isinstance(detail, str) and detail.strip():
                    details = detail.strip()
    except Exception:
        text = response.text.strip()
        if text:
            details = text[:500]

    base = f"Lemon Squeezy returned {response.status_code}"
    if details:
        base = f"{base}: {details}"
    if response.status_code == 422:
        base = f"{base} (check Store ID + Variant IDs)"
    return base


async def create_checkout(
    settings: Settings,
    *,
    variant_id: str,
    user_id: str,
    custom_data: dict[str, Any],
    custom_price_cents: int | None = None,
) -> str:
    api_key = _require_lemon_api_key(settings)
    store_id = _require_store_id(settings)
    variant_id = variant_id.strip()
    if not variant_id:
        raise ValueError("Variant ID missing")

    normalized_custom = _normalize_checkout_custom_data({"user_id": user_id, **custom_data})

    attributes: dict[str, Any] = {
        "checkout_data": {"custom": normalized_custom},
    }
    product_options: dict[str, Any] = {}
    if settings.lemon_squeezy_redirect_url.strip():
        product_options["redirect_url"] = settings.lemon_squeezy_redirect_url.strip()
    if product_options:
        attributes["product_options"] = product_options
    if settings.lemon_squeezy_test_mode:
        attributes["test_mode"] = True
    if custom_price_cents is not None:
        attributes["custom_price"] = int(custom_price_cents)

    body = {
        "data": {
            "type": "checkouts",
            "attributes": attributes,
            "relationships": {
                "store": {"data": {"type": "stores", "id": store_id}},
                "variant": {"data": {"type": "variants", "id": variant_id}},
            },
        }
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
    }

    async with httpx.AsyncClient(timeout=LEMON_TIMEOUT, follow_redirects=True) as client:
        response = await client.post(f"{LEMON_API_BASE}/checkouts", headers=headers, content=json.dumps(body))
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as error:
            raise LemonSqueezyApiError(error.response.status_code, _format_lemon_error(error.response)) from error
        data = response.json().get("data") or {}
        url = ((data.get("attributes") or {}) if isinstance(data, dict) else {}).get("url")
        if not isinstance(url, str) or not url.strip():
            raise ValueError("Checkout URL missing in response")
        return url.strip()


async def get_customer_portal_url(settings: Settings, subscription_id: str) -> str:
    api_key = _require_lemon_api_key(settings)
    subscription_id = subscription_id.strip()
    if not subscription_id:
        raise ValueError("Subscription ID missing")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/vnd.api+json",
    }
    async with httpx.AsyncClient(timeout=LEMON_TIMEOUT, follow_redirects=True) as client:
        response = await client.get(f"{LEMON_API_BASE}/subscriptions/{subscription_id}", headers=headers)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as error:
            raise LemonSqueezyApiError(error.response.status_code, _format_lemon_error(error.response)) from error
        data = response.json().get("data") or {}
        attributes = (data.get("attributes") or {}) if isinstance(data, dict) else {}
        urls = attributes.get("urls") if isinstance(attributes.get("urls"), dict) else {}
        portal_url = urls.get("customer_portal")
        if not isinstance(portal_url, str) or not portal_url.strip():
            raise ValueError("Customer portal URL missing in response")
        return portal_url.strip()
