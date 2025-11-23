from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..models import HttpMethod


class EndpointPayload(BaseModel):
    path: str
    method: HttpMethod
    tool: dict[str, Any]


class EndpointResponse(EndpointPayload):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class PaginatedEndpointsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    items: list[EndpointResponse]
    page: int
    page_size: int = Field(alias="pageSize")
    total: int
