from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..models import AuthType, StorageSource


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


class FrontendContextRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    goal: str
    scope: str | None = None
    include_dom: bool = Field(default=True, alias="includeDom")
    include_screenshot: bool = Field(default=False, alias="includeScreenshot")
    screenshot_scale: float | None = Field(default=None, alias="screenshotScale")
    max_elements: int = Field(default=60, alias="maxElements")
    viewport_only: bool = Field(default=True, alias="viewportOnly")
    include_offscreen: bool = Field(default=False, alias="includeOffscreen")
    selector_hints: list[str] = Field(default_factory=list, alias="selectorHints")


class FrontendActionPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    action: str
    selector: str | None = None
    text: str | None = None
    value: Any | None = None
    key: str | None = None
    keys: list[str] | None = None
    delay_ms: int | None = Field(default=None, alias="delayMs")
    timeout_ms: int | None = Field(default=None, alias="timeoutMs")
    continue_on_error: bool = Field(default=False, alias="continueOnError")


class ToolCallPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    tool_type: str = Field(default="endpoint", alias="type")
    name: str
    endpoint_id: UUID | None = Field(default=None, alias="endpointId")
    method: str | None = None
    path: str | None = None
    params: dict[str, Any] = {}
    query: dict[str, Any] = {}
    body: dict[str, Any] = {}
    headers: dict[str, str] = {}
    goal: str | None = None
    context: FrontendContextRequest | None = None
    actions: list[FrontendActionPayload] = Field(default_factory=list)


class ToolResultPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    status_code: int = Field(alias="statusCode")
    consume_action: bool = Field(default=True, alias="consumeAction")
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
