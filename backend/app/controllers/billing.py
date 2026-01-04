import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..core.auth import require_clerk_session
from ..core.config import get_settings
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.auth import ClerkSession
from ..schemas.billing import (
    BillingCheckoutResponse,
    BillingPortalResponse,
    BillingSummaryResponse,
    EnterpriseCheckoutRequest,
    SubscriptionCheckoutRequest,
    TopUpCheckoutRequest,
)
from ..services.billing_service import (
    BASIC_MONTHLY_ACTIONS,
    PRO_MONTHLY_ACTIONS,
    get_billing_actions_summary,
    get_or_create_billing_account,
)
from ..services.lemon_squeezy_service import LemonSqueezyApiError, create_checkout, get_customer_portal_url

router = APIRouter(tags=["billing"])


@router.get("/billing", response_model=BillingSummaryResponse)
def get_billing_summary(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session),
) -> BillingSummaryResponse:
    try:
        summary = get_billing_actions_summary(session, clerk_session.user_id)
        return BillingSummaryResponse(
            plan=summary.plan,
            actionsRemaining=summary.total_remaining,
            monthlyActionsRemaining=summary.monthly_remaining,
            monthlyActionQuota=summary.monthly_quota,
            topupActionsRemaining=summary.topup_remaining,
            lifetimeActionsRemaining=summary.lifetime_remaining,
            isWidgetHidden=summary.is_widget_hidden,
            canManageSubscription=summary.can_manage_subscription,
            subscriptionStatus=summary.subscription_status,
            subscriptionRenewsAt=summary.subscription_renews_at,
        )
    except Exception as error:
        log_error("BillingController", "get_billing_summary", "Failed to get billing summary", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get billing summary")


@router.post("/billing/checkout/subscription", response_model=BillingCheckoutResponse)
async def create_subscription_checkout(
    payload: SubscriptionCheckoutRequest,
    clerk_session: ClerkSession = Depends(require_clerk_session),
) -> BillingCheckoutResponse:
    settings = get_settings()
    plan = payload.plan
    variant_id = settings.lemon_squeezy_basic_variant_id if plan == "basic" else settings.lemon_squeezy_pro_variant_id
    quota = BASIC_MONTHLY_ACTIONS if plan == "basic" else PRO_MONTHLY_ACTIONS
    if not variant_id.strip():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing is not configured")
    try:
        url = await create_checkout(
            settings,
            variant_id=variant_id,
            user_id=clerk_session.user_id,
            custom_data={"plan": plan, "monthly_actions": quota},
        )
        log_info("BillingController", "create_subscription_checkout", "Checkout created", user_id=clerk_session.user_id, plan=plan)
        return BillingCheckoutResponse(url=url)
    except ValueError as error:
        log_error("BillingController", "create_subscription_checkout", "Checkout misconfigured", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error))
    except LemonSqueezyApiError as error:
        log_error(
            "BillingController",
            "create_subscription_checkout",
            "Checkout rejected by Lemon Squeezy",
            exc=error,
            user_id=clerk_session.user_id,
            lemon_status_code=error.status_code,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=error.message)
    except Exception as error:
        log_error("BillingController", "create_subscription_checkout", "Failed to create checkout", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to create checkout")


@router.post("/billing/checkout/topup", response_model=BillingCheckoutResponse)
async def create_topup_checkout(
    payload: TopUpCheckoutRequest,
    clerk_session: ClerkSession = Depends(require_clerk_session),
) -> BillingCheckoutResponse:
    settings = get_settings()
    package = payload.package
    if package == "1000":
        variant_id = settings.lemon_squeezy_topup_1000_variant_id
        actions = 1_000
    elif package == "5000":
        variant_id = settings.lemon_squeezy_topup_5000_variant_id
        actions = 5_000
    elif package == "10000":
        variant_id = settings.lemon_squeezy_topup_10000_variant_id
        actions = 10_000
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid package: {package}")

    if not variant_id.strip():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing is not configured")

    try:
        url = await create_checkout(
            settings,
            variant_id=variant_id,
            user_id=clerk_session.user_id,
            custom_data={"kind": "topup", "topup_actions": actions},
        )
        log_info("BillingController", "create_topup_checkout", "Top-up checkout created", user_id=clerk_session.user_id, actions=actions)
        return BillingCheckoutResponse(url=url)
    except ValueError as error:
        log_error("BillingController", "create_topup_checkout", "Checkout misconfigured", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error))
    except LemonSqueezyApiError as error:
        log_error(
            "BillingController",
            "create_topup_checkout",
            "Checkout rejected by Lemon Squeezy",
            exc=error,
            user_id=clerk_session.user_id,
            lemon_status_code=error.status_code,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=error.message)
    except Exception as error:
        log_error("BillingController", "create_topup_checkout", "Failed to create checkout", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to create checkout")


def _require_admin_token(request: Request) -> None:
    settings = get_settings()
    expected = settings.billing_admin_token.strip()
    if not expected:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Enterprise billing is not configured")
    provided = (request.headers.get("x-warpy-admin-token") or "").strip()
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.post("/billing/checkout/enterprise", response_model=BillingCheckoutResponse)
async def create_enterprise_checkout(
    request: Request,
    payload: EnterpriseCheckoutRequest,
    clerk_session: ClerkSession = Depends(require_clerk_session),
) -> BillingCheckoutResponse:
    _require_admin_token(request)
    settings = get_settings()
    variant_id = settings.lemon_squeezy_enterprise_variant_id
    if not variant_id.strip():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Enterprise billing is not configured")

    try:
        url = await create_checkout(
            settings,
            variant_id=variant_id,
            user_id=clerk_session.user_id,
            custom_data={"plan": "enterprise", "monthly_actions": payload.monthly_actions},
            custom_price_cents=payload.custom_price_cents,
        )
        log_info("BillingController", "create_enterprise_checkout", "Enterprise checkout created", user_id=clerk_session.user_id)
        return BillingCheckoutResponse(url=url)
    except ValueError as error:
        log_error("BillingController", "create_enterprise_checkout", "Checkout misconfigured", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error))
    except LemonSqueezyApiError as error:
        log_error(
            "BillingController",
            "create_enterprise_checkout",
            "Checkout rejected by Lemon Squeezy",
            exc=error,
            user_id=clerk_session.user_id,
            lemon_status_code=error.status_code,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=error.message)
    except Exception as error:
        log_error("BillingController", "create_enterprise_checkout", "Failed to create checkout", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to create checkout")


@router.post("/billing/portal", response_model=BillingPortalResponse)
async def open_customer_portal(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session),
) -> BillingPortalResponse:
    settings = get_settings()
    account = get_or_create_billing_account(session, clerk_session.user_id)
    if not account.lemon_subscription_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No subscription found")
    try:
        url = await get_customer_portal_url(settings, account.lemon_subscription_id)
        log_info("BillingController", "open_customer_portal", "Portal URL fetched", user_id=clerk_session.user_id)
        return BillingPortalResponse(url=url)
    except ValueError as error:
        log_error("BillingController", "open_customer_portal", "Portal misconfigured", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error))
    except LemonSqueezyApiError as error:
        log_error(
            "BillingController",
            "open_customer_portal",
            "Customer portal rejected by Lemon Squeezy",
            exc=error,
            user_id=clerk_session.user_id,
            lemon_status_code=error.status_code,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=error.message)
    except Exception as error:
        log_error("BillingController", "open_customer_portal", "Failed to fetch portal URL", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to fetch customer portal URL")
