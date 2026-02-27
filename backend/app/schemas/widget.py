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
    include_offscreen: bool = Field(default=False, alias="includeOffscreen")
    max_elements: int = Field(default=60, alias="maxElements")
    selector_hints: list[str] = Field(default_factory=list, alias="selectorHints")


class FrontendActionPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    action: str
    ref: str | None = None
    selector: str | None = None
    selector_alternatives: list[str] = Field(default_factory=list, alias="selectorAlternatives", max_length=3)
    scope: str | None = None
    scope_alternatives: list[str] = Field(default_factory=list, alias="scopeAlternatives", max_length=3)
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
    tool_type: str = Field(default="backend", alias="type")
    name: str
    tool_id: UUID | None = Field(default=None, alias="toolId")
    method: str | None = None
    path: str | None = None
    params: dict[str, Any] = {}
    query: dict[str, Any] = {}
    body: dict[str, Any] = {}
    headers: dict[str, str] = {}
    goal: str | None = None
    context: FrontendContextRequest | None = None
    actions: list[FrontendActionPayload] = Field(default_factory=list)
    read_page_options: dict[str, Any] | None = Field(default=None, alias="readPageOptions")
    find_query: str | None = Field(default=None, alias="findQuery")
    js_code: str | None = Field(default=None, alias="jsCode")


class ToolResultPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    status_code: int = Field(alias="statusCode")
    body: Any = None
    error: str | None = None
    consume_action: bool = Field(default=True, alias="consumeAction")


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
