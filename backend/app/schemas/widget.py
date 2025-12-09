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


class TranscriptionResponse(BaseModel):
    text: str
