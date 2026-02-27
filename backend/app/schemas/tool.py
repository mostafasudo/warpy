from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..models import HttpMethod
from .feature import FeatureResponse, FeatureSelector

ToolType = Literal["backend", "frontend"]


class ToolPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tool_type: ToolType = Field(default="backend", alias="toolType")
    path: str | None = None
    method: HttpMethod | None = None
    tool: dict[str, Any]
    agent_enabled: bool = Field(default=True, alias="agentEnabled")
    feature: FeatureSelector = Field(default_factory=FeatureSelector)

    @model_validator(mode="after")
    def validate_backend_fields(self):
        if self.tool_type == "backend":
            if not self.path or not self.path.strip():
                raise ValueError("Path is required for backend tools")
            if not self.method:
                raise ValueError("Method is required for backend tools")
        return self


class ToolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    tool_type: ToolType = Field(default="backend", alias="toolType")
    path: str | None = None
    method: HttpMethod | None = None
    tool: dict[str, Any]
    agent_enabled: bool = Field(alias="agentEnabled")
    feature: FeatureResponse


class PaginatedToolsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    items: list[ToolResponse]
    page: int
    page_size: int = Field(alias="pageSize")
    total: int


from .feature import FeatureWithToolsResponse

FeatureWithToolsResponse.model_rebuild(_types_namespace={"ToolResponse": ToolResponse})
