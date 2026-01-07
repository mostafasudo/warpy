from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..models import BillingPlan


class BillingSummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    plan: BillingPlan
    actions_remaining: int = Field(alias="actionsRemaining")
    monthly_actions_remaining: int = Field(alias="monthlyActionsRemaining")
    monthly_action_quota: int = Field(alias="monthlyActionQuota")
    topup_actions_remaining: int = Field(alias="topupActionsRemaining")
    lifetime_actions_remaining: int = Field(alias="lifetimeActionsRemaining")
    is_widget_hidden: bool = Field(alias="isWidgetHidden")
    can_manage_subscription: bool = Field(alias="canManageSubscription")
    subscription_status: str | None = Field(default=None, alias="subscriptionStatus")
    subscription_renews_at: datetime | None = Field(default=None, alias="subscriptionRenewsAt")


class BillingCheckoutResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str


class BillingPortalResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str


class SubscriptionCheckoutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    plan: Literal["basic", "pro"]


class TopUpCheckoutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    package: Literal["1000", "5000", "10000"]


class EnterpriseCheckoutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    custom_price_cents: int = Field(alias="customPriceCents", ge=1)
    monthly_actions: int = Field(alias="monthlyActions", ge=1)
