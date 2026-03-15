from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..core.agent_custom_system_prompt import CUSTOM_USER_SYSTEM_PROMPT_MAX_LENGTH

WIDGET_STARTER_SUGGESTION_MAX_COUNT = 3


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    user_id: str = Field(alias="userId")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class WidgetSecurityActive(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    require_signed_widget_token: bool = Field(alias="requireSignedWidgetToken")
    widget_refresh_endpoint_path: str = Field(alias="widgetRefreshEndpointPath")
    has_api_key: bool = Field(alias="hasApiKey")
    api_key_last4: str | None = Field(default=None, alias="apiKeyLast4")


class WidgetSecurityDraft(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    require_signed_widget_token: bool | None = Field(default=None, alias="requireSignedWidgetToken")
    widget_refresh_endpoint_path: str | None = Field(default=None, alias="widgetRefreshEndpointPath")
    api_key_last4: str | None = Field(default=None, alias="apiKeyLast4")


class WidgetSecurityResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    active: WidgetSecurityActive
    draft: WidgetSecurityDraft | None = None
    has_staged_changes: bool = Field(alias="hasStagedChanges")


class WidgetSecurityDraftUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    require_signed_widget_token: bool | None = Field(default=None, alias="requireSignedWidgetToken")
    widget_refresh_endpoint_path: str | None = Field(default=None, alias="widgetRefreshEndpointPath")


class WidgetApiKeyCreateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    api_key: str = Field(alias="apiKey")
    api_key_last4: str = Field(alias="apiKeyLast4")


class AgentWidgetConfigResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    widget_title: str = Field(alias="widgetTitle", min_length=1, max_length=80)
    widget_icon_url: str | None = Field(default=None, alias="widgetIconUrl", max_length=2048)
    widget_behavior: Literal["overlay", "push"] = Field(default="overlay", alias="widgetBehavior")
    widget_empty_title: str = Field(alias="widgetEmptyTitle", max_length=120)
    widget_empty_description: str = Field(alias="widgetEmptyDescription", max_length=240)
    widget_input_placeholder: str = Field(alias="widgetInputPlaceholder", min_length=1, max_length=120)
    widget_suggestions_enabled: bool = Field(default=False, alias="widgetSuggestionsEnabled")
    widget_starter_suggestions: list[str] = Field(
        default_factory=list,
        alias="widgetStarterSuggestions",
        max_length=WIDGET_STARTER_SUGGESTION_MAX_COUNT,
    )
    widget_security_disclosure_enabled: bool = Field(default=True, alias="widgetSecurityDisclosureEnabled")


class AgentWidgetConfigUpdate(AgentWidgetConfigResponse):
    pass


WidgetInstallFramework = Literal["script", "react", "vue", "angular", "svelte", "vanilla"]
WidgetInstallPackageManager = Literal["npm", "pnpm", "yarn"]


class AgentWidgetInstallResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    framework: WidgetInstallFramework = Field(alias="framework")
    package_manager: WidgetInstallPackageManager = Field(alias="packageManager")


class AgentWidgetInstallUpdate(AgentWidgetInstallResponse):
    pass
class FrontendCapabilityResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool


class FrontendCapabilityUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool


class CustomUserSystemPromptResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    custom_user_system_prompt: str = Field(
        alias="customUserSystemPrompt",
        max_length=CUSTOM_USER_SYSTEM_PROMPT_MAX_LENGTH,
    )


class CustomUserSystemPromptUpdate(CustomUserSystemPromptResponse):
    pass


class UserRateLimitsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool
    daily_limit: int | None = Field(default=None, alias="dailyLimit")
    monthly_limit: int | None = Field(default=None, alias="monthlyLimit")


class UserRateLimitsUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool
    daily_limit: int | None = Field(default=None, alias="dailyLimit", ge=1)
    monthly_limit: int | None = Field(default=None, alias="monthlyLimit", ge=1)
