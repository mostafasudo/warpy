from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..models import HttpMethod
from .feature import FeatureResponse, FeatureSelector


class EndpointPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    path: str
    method: HttpMethod
    tool: dict[str, Any]
    agent_enabled: bool = Field(default=True, alias="agentEnabled")
    feature: FeatureSelector = Field(default_factory=FeatureSelector)


class EndpointResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    path: str
    method: HttpMethod
    tool: dict[str, Any]
    agent_enabled: bool = Field(alias="agentEnabled")
    feature: FeatureResponse


class PaginatedEndpointsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    items: list[EndpointResponse]
    page: int
    page_size: int = Field(alias="pageSize")
    total: int


from .feature import FeatureWithEndpointsResponse

FeatureWithEndpointsResponse.model_rebuild(_types_namespace={"EndpointResponse": EndpointResponse})
