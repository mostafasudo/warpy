from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
    widget_subtitle: str = Field(alias="widgetSubtitle", min_length=1, max_length=80)
    widget_icon_url: str | None = Field(default=None, alias="widgetIconUrl", max_length=2048)
    widget_empty_title: str = Field(alias="widgetEmptyTitle", min_length=1, max_length=120)
    widget_empty_description: str = Field(alias="widgetEmptyDescription", min_length=1, max_length=240)
    widget_input_placeholder: str = Field(alias="widgetInputPlaceholder", min_length=1, max_length=120)
    widget_security_disclosure_enabled: bool = Field(default=True, alias="widgetSecurityDisclosureEnabled")
    widget_primary_color: str | None = Field(default=None, alias="widgetPrimaryColor")
    widget_text_color: str | None = Field(default=None, alias="widgetTextColor")
    widget_background_color: str | None = Field(default=None, alias="widgetBackgroundColor")
    widget_border_width_container: int | None = Field(default=None, alias="widgetBorderWidthContainer")
    widget_border_width_message: int | None = Field(default=None, alias="widgetBorderWidthMessage")
    widget_border_width_button: int | None = Field(default=None, alias="widgetBorderWidthButton")


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


class ConversationCreate(BaseModel):
    participant: str


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    agent_id: UUID = Field(alias="agentId")
    participant: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    conversation_id: UUID = Field(alias="conversationId")
    role: str
    content: str
    created_at: datetime = Field(alias="createdAt")


class ConversationWithMessagesResponse(ConversationResponse):
    messages: list[MessageResponse] = []


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    message: MessageResponse
    response: MessageResponse


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

