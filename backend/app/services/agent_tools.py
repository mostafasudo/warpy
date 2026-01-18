import json
from typing import Any
from uuid import UUID

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Endpoint
from .embedding_service import search_similar_endpoints
from .agent_execution import execute_endpoint
from .agent_schema import SchemaFactory, serialize_args


class FindActionsInput(BaseModel):
    query: str = Field(description="What the user wants to accomplish")


class FrontendContextInput(BaseModel):
    goal: str = Field(description="What needs to be done on the current page")
    scope: str | None = Field(default=None, description="Optional CSS selector or UI region hint")
    include_screenshot: bool = Field(default=False, alias="includeScreenshot")
    screenshot_scale: float | None = Field(default=None, alias="screenshotScale")
    include_dom: bool = Field(default=True, alias="includeDom")
    max_elements: int = Field(default=60, alias="maxElements")
    viewport_only: bool = Field(default=True, alias="viewportOnly")
    include_offscreen: bool = Field(default=False, alias="includeOffscreen")
    selector_hints: list[str] = Field(default_factory=list, alias="selectorHints")


class FrontendActionInput(BaseModel):
    action: str = Field(description="Action type: click, type, select, scroll, wait, hover, focus, blur, press, etc.")
    selector: str | None = Field(default=None, description="CSS selector or text=/label=/role= query")
    target: str | None = Field(default=None, description="Alias for selector")
    role: str | None = Field(default=None, description="Role shortcut for selectors")
    text: str | None = Field(default=None, description="Text to type or match")
    value: Any | None = Field(default=None, description="Value to set/select")
    key: str | None = Field(default=None, description="Single key to press")
    keys: list[str] | None = Field(default=None, description="Key sequence to press")
    index: int | None = Field(default=None, description="Index for select options")
    x: float | None = Field(default=None, description="X coordinate (px or 0-1)")
    y: float | None = Field(default=None, description="Y coordinate (px or 0-1)")
    mode: str | None = Field(default=None, description="Input mode: replace or append")
    behavior: str | None = Field(default=None, description="Scroll behavior: auto or smooth")
    from_: str | None = Field(default=None, alias="from", description="Drag source selector")
    to: str | None = Field(default=None, description="Drag target selector")
    events: list[str] | None = Field(default=None, description="Events for dispatch")
    delay_ms: int | None = Field(default=None, alias="delayMs")
    timeout_ms: int | None = Field(default=None, alias="timeoutMs")
    continue_on_error: bool = Field(default=False, alias="continueOnError")


class FrontendActionsInput(BaseModel):
    goal: str | None = Field(default=None, description="Short goal for the UI changes")
    actions: list[FrontendActionInput] = Field(default_factory=list)


def create_find_actions_tool(session: Session, user_id: str) -> StructuredTool:
    def find_actions(query: str) -> str:
        endpoint_ids = search_similar_endpoints(session, user_id, query)
        if not endpoint_ids:
            return json.dumps([], indent=2)
        endpoints = session.scalars(
            select(Endpoint).where(
                Endpoint.id.in_(endpoint_ids),
                Endpoint.user_id == user_id,
                Endpoint.agent_enabled.is_(True)
            ).options(selectinload(Endpoint.feature))
        ).all()
        if not endpoints:
            return json.dumps([], indent=2)
        result = []
        for endpoint in endpoints:
            tool = endpoint.tool or {}
            function = tool.get("function", {})
            result.append(
                {
                    "id": str(endpoint.id),
                    "method": endpoint.method.value,
                    "path": endpoint.path,
                    "name": function.get("name", ""),
                    "description": function.get("description", ""),
                    "feature": getattr(endpoint.feature, "name", "")
                }
            )
        return json.dumps(result, indent=2)

    return StructuredTool.from_function(
        func=find_actions,
        name="find_actions",
        description=(
            "Task: Find relevant backend actions for the user's request. "
            "Use when you need available endpoints or are unsure what to call. "
            "Output: JSON list of actions with id, method, path, name, description, feature. "
            "If the list is empty, no backend action fits—switch to frontend_context."
        ),
        args_schema=FindActionsInput
    )


def create_frontend_context_tool() -> StructuredTool:
    def frontend_context(**_kwargs: Any) -> str:
        return json.dumps({"status": "queued"})

    return StructuredTool.from_function(
        func=frontend_context,
        name="frontend_context",
        description=(
            "Task: Request a focused UI snapshot of the current page. "
            "Provide goal and optional scope/selector hints. "
            "Output: Structured context with relevant elements and optional screenshot."
        ),
        args_schema=FrontendContextInput
    )


def create_frontend_actions_tool() -> StructuredTool:
    def frontend(**_kwargs: Any) -> str:
        return json.dumps({"status": "queued"})

    return StructuredTool.from_function(
        func=frontend,
        name="frontend",
        description=(
            "Task: Execute frontend UI actions in order. "
            "Use selectors from frontend_context and include waits for dynamic UI. "
            "Output: Per-action results with status."
        ),
        args_schema=FrontendActionsInput
    )


def create_endpoint_tool(
    session: Session,
    user_id: str,
    endpoint: Endpoint,
    schema_factory: SchemaFactory | None = None,
    conversation_id: UUID | None = None,
) -> StructuredTool:
    factory = schema_factory or SchemaFactory()
    tool_spec = endpoint.tool or {}
    function_spec = tool_spec.get("function", {})
    name = function_spec.get("name", f"endpoint_{endpoint.id}")
    description = function_spec.get("description", f"{endpoint.method.value} {endpoint.path}")
    parameters = function_spec.get("parameters", {"type": "object", "properties": {}})
    InputModel = factory.model_from_schema(f"{name}Input", parameters)

    def execute_func(**kwargs: Any) -> str:
        serialized = serialize_args(kwargs)
        filtered = {key: value for key, value in serialized.items() if value is not None}
        result = execute_endpoint(session, user_id, endpoint, filtered, conversation_id=conversation_id)
        return json.dumps(result, indent=2)

    return StructuredTool.from_function(
        func=execute_func,
        name=name,
        description=description,
        args_schema=InputModel
    )


def get_endpoint_tools(
    session: Session,
    user_id: str,
    endpoint_ids: list[UUID],
    schema_factory: SchemaFactory | None = None,
    conversation_id: UUID | None = None,
) -> list[StructuredTool]:
    if not endpoint_ids:
        return []
    endpoints = session.scalars(
        select(Endpoint).where(
            Endpoint.id.in_(endpoint_ids),
            Endpoint.user_id == user_id,
            Endpoint.agent_enabled.is_(True)
        )
    ).all()
    factory = schema_factory or SchemaFactory()
    return [create_endpoint_tool(session, user_id, endpoint, factory, conversation_id=conversation_id) for endpoint in endpoints]
