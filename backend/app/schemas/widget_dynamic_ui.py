from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


WidgetResponseMode = Literal["markdown", "warpy_components", "native_components"]
WidgetNativeFramework = Literal["react", "vue", "angular", "svelte", "vanilla", "script"]

COMPONENT_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,63}$")


class WidgetRenderPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    kind: Literal["warpy_components", "native_components"]
    version: Literal[1] = 1
    markdown_fallback: str = Field(alias="markdownFallback", min_length=1)
    tree: Optional[List[Dict[str, Any]]] = None
    component_key: Optional[str] = Field(default=None, alias="componentKey")
    component_version: Optional[str] = Field(default=None, alias="componentVersion")
    props: Optional[Dict[str, Any]] = None

    @model_validator(mode="after")
    def validate_payload_shape(self) -> "WidgetRenderPayload":
        if self.kind == "warpy_components" and not self.tree:
            raise ValueError("Warpy component payloads require a tree.")
        if self.kind == "native_components" and (not self.component_key or self.props is None):
            raise ValueError("Native component payloads require componentKey and props.")
        return self


class WidgetUiComponentPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    key: str = Field(min_length=2, max_length=64)
    version: str = Field(default="1", min_length=1, max_length=32)
    display_name: str = Field(alias="displayName", min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=500)
    framework: WidgetNativeFramework = "react"
    props_schema: Dict[str, Any] = Field(alias="propsSchema")
    suitability: str = Field(min_length=1, max_length=1000)
    constraints: Dict[str, Any] = Field(default_factory=dict)
    active: bool = True

    @model_validator(mode="after")
    def validate_component_contract(self) -> "WidgetUiComponentPayload":
        key = self.key.strip()
        if not COMPONENT_KEY_PATTERN.fullmatch(key):
            raise ValueError("Component key must be lowercase snake_case and start with a letter.")
        self.key = key
        self.version = self.version.strip()
        self.display_name = self.display_name.strip()
        self.description = self.description.strip()
        self.suitability = self.suitability.strip()
        if not self.version or not self.display_name or not self.description or not self.suitability:
            raise ValueError("Component version, displayName, description, and suitability are required.")
        if self.props_schema.get("type") != "object" or not isinstance(self.props_schema.get("properties"), dict):
            raise ValueError("propsSchema must be a JSON schema object with properties.")
        required = self.props_schema.get("required", [])
        if required is not None and (
            not isinstance(required, list) or any(not isinstance(item, str) for item in required)
        ):
            raise ValueError("propsSchema.required must be a list of property names.")
        return self


class WidgetUiComponentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    component_key: str = Field(alias="key")
    version: str
    display_name: str = Field(alias="displayName")
    description: str
    framework: WidgetNativeFramework
    props_schema: Dict[str, Any] = Field(alias="propsSchema")
    suitability: str
    constraints: Dict[str, Any]
    active: bool
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class WidgetUiComponentsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: List[WidgetUiComponentResponse]
