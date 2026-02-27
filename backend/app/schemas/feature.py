from enum import Enum
from typing import TYPE_CHECKING, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

if TYPE_CHECKING:
    from .tool import ToolResponse


class FeatureEnabledState(str, Enum):
    enabled = "enabled"
    disabled = "disabled"
    partial = "partial"


class FeatureSelector(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    mode: Literal["existing", "new", "auto"] = "auto"
    id: UUID | None = Field(default=None, alias="id")
    name: str | None = None

    @model_validator(mode="after")
    def validate_choice(self):
        trimmed = self.name.strip() if isinstance(self.name, str) else None
        if self.mode == "existing" and not self.id:
            raise ValueError("Feature id is required")
        if self.mode == "new" and not trimmed:
            raise ValueError("Feature name is required")
        if trimmed:
            object.__setattr__(self, "name", trimmed)
        return self


class FeaturePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=128)


class FeatureResponse(FeaturePayload):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    enabled_state: FeatureEnabledState = Field(alias="enabledState")
    tool_count: int = Field(alias="toolCount")


class FeatureTogglePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    agent_enabled: bool = Field(alias="agentEnabled")


class ToolPagination(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    page: int = Field(ge=1)
    page_size: int = Field(ge=1, alias="pageSize")
    total: int = Field(ge=0)
    total_pages: int = Field(ge=1, alias="totalPages")

    @computed_field(alias="hasMore")
    @property
    def has_more(self) -> bool:
        return self.page < self.total_pages


class FeatureWithToolsResponse(FeatureResponse):
    tools: list["ToolResponse"] = Field(default_factory=list)
    pagination: ToolPagination
