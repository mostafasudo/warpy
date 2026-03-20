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


class KnowledgeWebsiteCreate(BaseModel):
    url: str


class KnowledgeWebsiteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    input_url: str = Field(alias="inputUrl")
    scope_url: str = Field(alias="scopeUrl")
    status: str
    page_count: int = Field(alias="pageCount")
    ready_page_count: int = Field(alias="readyPageCount")
    failed_page_count: int = Field(alias="failedPageCount")
    searchable_page_count: int = Field(alias="searchablePageCount")
    error_message: str | None = Field(default=None, alias="errorMessage")
    last_crawled_at: datetime | None = Field(default=None, alias="lastCrawledAt")
    last_successful_crawled_at: datetime | None = Field(default=None, alias="lastSuccessfulCrawledAt")
    next_refresh_at: datetime | None = Field(default=None, alias="nextRefreshAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class KnowledgeWebsiteListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[KnowledgeWebsiteResponse]
    total: int


class KnowledgeWebsitePageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    page_name: str = Field(alias="pageName")
    source_url: str = Field(alias="sourceUrl")
    status: str
    section_count: int = Field(alias="sectionCount")
    is_searchable: bool = Field(alias="isSearchable")
    error_message: str | None = Field(default=None, alias="errorMessage")
    updated_at: datetime = Field(alias="updatedAt")


class KnowledgeWebsiteDetailResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    website: KnowledgeWebsiteResponse
    pages: list[KnowledgeWebsitePageResponse]
