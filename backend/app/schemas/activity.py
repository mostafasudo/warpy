from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ActivityTopAction(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    feature: str
    action: str
    count: int


class ActivitySummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    conversation_count: int = Field(alias="conversationCount")
    action_count: int = Field(alias="actionCount")
    has_any_conversation: bool = Field(alias="hasAnyConversation")
    top_actions: list[ActivityTopAction] = Field(default_factory=list, alias="topActions")


class ActivityConversationRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    participant: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    user_message_count: int = Field(alias="userMessageCount")
    action_count: int = Field(alias="actionCount")


class ActivityConversationsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[ActivityConversationRow] = []
    next_cursor: str | None = Field(default=None, alias="nextCursor")


class ActivityMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    role: str
    content: str
    created_at: datetime = Field(alias="createdAt")


class ActivityActionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    params: dict[str, Any] = {}
    query: dict[str, Any] = {}
    body: dict[str, Any] = {}


class ActivityActionEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    created_at: datetime = Field(alias="createdAt")
    feature: str
    action: str
    status_code: int | None = Field(default=None, alias="statusCode")
    error: str | None = None
    request: ActivityActionRequest


class ActivityConversationDetailResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    participant: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    messages: list[ActivityMessage] = []
    next_message_cursor: str | None = Field(default=None, alias="nextMessageCursor")

    actions: list[ActivityActionEvent] = []
    next_action_cursor: str | None = Field(default=None, alias="nextActionCursor")
