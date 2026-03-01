from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    file_name: str = Field(alias="fileName")
    file_type: str = Field(alias="fileType")
    file_size: int = Field(alias="fileSize")
    status: str
    chunk_count: int = Field(alias="chunkCount")
    error_message: str | None = Field(default=None, alias="errorMessage")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class KnowledgeDocumentListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[KnowledgeDocumentResponse]
    total: int


class KnowledgeBaseStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool
    document_count: int = Field(alias="documentCount")
    ready_document_count: int = Field(alias="readyDocumentCount")


class KnowledgeBaseToggle(BaseModel):
    enabled: bool


class KnowledgeChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    content: str
    chunk_index: int = Field(alias="chunkIndex")
    chunk_metadata: dict | None = Field(default=None, alias="chunkMetadata")


class KnowledgeDocumentContentResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    document_id: UUID = Field(alias="documentId")
    file_name: str = Field(alias="fileName")
    chunks: list[KnowledgeChunkResponse]
    total_chunks: int = Field(alias="totalChunks")
