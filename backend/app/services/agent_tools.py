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
    query: str = Field(
        description="Concise task description in the user's words; include key nouns and verbs only."
    )


class FrontendContextInput(BaseModel):
    goal: str = Field(
        description="Concrete UI outcome to capture context for (e.g., 'open date range picker')."
    )
    scope: str | None = Field(
        default=None,
        description="Optional CSS selector to limit the scan to a known container; use only when confident (e.g., '#filters', '.modal')."
    )
    include_offscreen: bool = Field(
        default=False,
        alias="includeOffscreen",
        description="Include offscreen elements in the context when the target is not visible in the viewport."
    )
    max_elements: int = Field(
        default=60,
        alias="maxElements",
        description="Raise only when the UI is dense and key controls are missing (e.g., large tables/filters); keep 60 by default and never exceed 160."
    )
    selector_hints: list[str] = Field(
        default_factory=list,
        alias="selectorHints",
        description="Optional short list of selector hints to bias matching (1-5 items); use `text=`, `label=`, or `role=` shortcuts when possible."
    )


class FrontendActionInput(BaseModel):
    action: str = Field(
        description="Required action verb; determines which fields to include (e.g., click, type, select, scroll, wait, hover, press, drag)."
    )
    selector: str | None = Field(
        default=None,
        description="Primary target selector (CSS or `text=`, `label=`, `role=` shortcut); include when the action targets a specific element, omit for wait/navigate or when using the focused element."
    )
    selector_alternatives: list[str] = Field(
        default_factory=list,
        alias="selectorAlternatives",
        max_length=3,
        description="Optional fallback selectors to try in order when the primary selector is unstable (max 3; mix `text=`, `role=`, and stable CSS/data-testid selectors)."
    )
    scope: str | None = Field(
        default=None,
        description="Optional scope root to constrain selector matching (e.g., 'modal', '#menu-root', '[role=\"menu\"]'). Use for ambiguous labels that appear in multiple page regions."
    )
    scope_alternatives: list[str] = Field(
        default_factory=list,
        alias="scopeAlternatives",
        max_length=3,
        description="Optional fallback scope roots to try when the primary scope is unstable."
    )
    role: str | None = Field(
        default=None,
        description="Role name to target when no selector or text-based selector is available (e.g., 'button', 'checkbox')."
    )
    text: str | None = Field(
        default=None,
        description="Text to type (type/input/set_value) or text to match for text-based selectors and wait_for_text."
    )
    value: Any | None = Field(
        default=None,
        description="Value to set/select; for select use option value/label, for navigate pass the URL here."
    )
    key: str | None = Field(
        default=None,
        description="Single key to press for press actions (e.g., 'Enter', 'Escape')."
    )
    keys: list[str] | None = Field(
        default=None,
        description="Ordered list of keys for multi-key press actions (e.g., ['Control', 'K'])."
    )
    index: int | None = Field(
        default=None,
        description="Zero-based index for select options when value/label is unreliable."
    )
    x: float | None = Field(
        default=None,
        description="Optional X coordinate (px or 0-1 relative) for pointer/drag/scroll precision."
    )
    y: float | None = Field(
        default=None,
        description="Optional Y coordinate (px or 0-1 relative) for pointer/drag/scroll precision."
    )
    mode: str | None = Field(
        default=None,
        description="Typing mode for type/input/set_value: 'replace' (default) or 'append'."
    )
    behavior: str | None = Field(
        default=None,
        description="Scroll behavior for scroll actions: 'auto' (default) or 'smooth'."
    )
    from_: str | None = Field(
        default=None,
        alias="from",
        description="Drag source selector for drag/drag_and_drop when different from the target."
    )
    to: str | None = Field(
        default=None,
        description="Drag target selector for drag_and_drop actions."
    )
    events: list[str] | None = Field(
        default=None,
        description="DOM event names to dispatch for dispatch actions (e.g., ['keydown'])."
    )
    delay_ms: int | None = Field(
        default=None,
        alias="delayMs",
        description="Milliseconds to wait after this action (0-10000) to let the UI settle."
    )
    timeout_ms: int | None = Field(
        default=None,
        alias="timeoutMs",
        description="Max time in milliseconds to wait for elements/text during this action."
    )
    continue_on_error: bool = Field(
        default=False,
        alias="continueOnError",
        description="If true, keep executing later actions after a failure; otherwise stop at first error."
    )
    retry_count: int = Field(
        default=0,
        alias="retryCount",
        ge=0,
        le=3,
        description="Number of retry attempts for transient failures (0-3); uses exponential backoff."
    )
    retry_delay_ms: int = Field(
        default=500,
        alias="retryDelayMs",
        ge=100,
        le=2000,
        description="Base delay in milliseconds between retries (100-2000); doubles with each attempt."
    )
    stability_ms: int | None = Field(
        default=None,
        alias="stabilityMs",
        description="For wait_for_stable: milliseconds of DOM stability required before proceeding (default 300)."
    )


class FrontendActionsInput(BaseModel):
    goal: str = Field(
        description="Short outcome label for the action sequence (e.g., 'Apply date filter', 'Create new feature')."
    )
    actions: list[FrontendActionInput] = Field(
        default_factory=list,
        description="Ordered list of UI actions to execute; each entry is a FrontendActionInput."
    )


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
            "Task: Request a focused UI snapshot of the current page, including interactive elements and a pixel-perfect screenshot of the user's tab when available. "
            "Provide goal and optional scope/selector hints. "
            "Output: Structured context with relevant elements, headings, suggested selectors, and a base64 screenshot image of the page when screen sharing is active."
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
