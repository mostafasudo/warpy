from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: str = Field(alias="userId")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


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

