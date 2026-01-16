from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..models import AuthType, StorageSource
from .widget_styles import WidgetStyles


class SessionHeaderConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source: StorageSource
    key: str
    auth_type: AuthType | None = Field(default=None, alias="authType")


class WidgetConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    headers: dict[str, SessionHeaderConfig] = {}
    is_widget_hidden: bool = Field(default=False, alias="isWidgetHidden")
    actions_remaining: int = Field(default=0, alias="actionsRemaining")
    require_signed_widget_token: bool = Field(default=False, alias="requireSignedWidgetToken")
    widget_refresh_endpoint_path: str = Field(default="/widget-token", alias="widgetRefreshEndpointPath")
    widget_title: str = Field(default="Warpy", alias="widgetTitle")
    widget_subtitle: str = Field(default="Ready to act", alias="widgetSubtitle")
    widget_icon_url: str | None = Field(default=None, alias="widgetIconUrl")
    widget_empty_title: str = Field(default="What would you like to do?", alias="widgetEmptyTitle")
    widget_empty_description: str = Field(
        default="Ask a question, request help, or describe what you want to get done.",
        alias="widgetEmptyDescription",
    )
    widget_input_placeholder: str = Field(default="Ask Warpy…", alias="widgetInputPlaceholder")
    security_disclosure_enabled: bool = Field(default=True, alias="securityDisclosureEnabled")
    widget_styles: WidgetStyles | None = Field(default=None, alias="widgetStyles")


class ToolCallPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    endpoint_id: UUID = Field(alias="endpointId")
    name: str
    method: str
    path: str
    params: dict[str, Any] = {}
    query: dict[str, Any] = {}
    body: dict[str, Any] = {}
    headers: dict[str, str] = {}


class ToolResultPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    status_code: int = Field(alias="statusCode")
    body: Any = None
    error: str | None = None


class WidgetMessagePayload(BaseModel):
    role: str
    content: str


class WidgetChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    agent_id: UUID = Field(alias="agentId")
    conversation_id: UUID | None = Field(default=None, alias="conversationId")
    message: str | None = None
    tool_results: list[ToolResultPayload] = Field(default=[], alias="toolResults")


class WidgetChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    conversation_id: UUID = Field(alias="conversationId")
    messages: list[WidgetMessagePayload] = []
    tool_calls: list[ToolCallPayload] = Field(default=[], alias="toolCalls")
    done: bool = False
    is_widget_hidden: bool = Field(default=False, alias="isWidgetHidden")
    actions_remaining: int = Field(default=0, alias="actionsRemaining")


class TranscriptionResponse(BaseModel):
    text: str
