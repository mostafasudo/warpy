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


class ReadPageInput(BaseModel):
    depth: int = Field(
        default=15,
        ge=1,
        le=30,
        description="Maximum tree depth to traverse (default 15). Reduce if output is too large."
    )
    filter: str = Field(
        default="all",
        description='Element filter: "interactive" for buttons/links/inputs only, "all" for all semantic elements (default).'
    )
    ref_id: str | None = Field(
        default=None,
        alias="refId",
        description="Scope to subtree of this ref ID (e.g., 'ref_5'). Use to drill into a specific component."
    )
    max_chars: int = Field(
        default=50000,
        alias="maxChars",
        ge=5000,
        le=80000,
        description="Maximum output characters (default 50000). Reduce if context is too large."
    )


class FindElementsInput(BaseModel):
    query: str = Field(
        description='Natural language description of what to find (e.g., "save button", "date filter", "search input").'
    )


class FrontendActionInput(BaseModel):
    action: str = Field(
        description="Action verb: click, type, select, scroll, wait, hover, press, drag, navigate, etc."
    )
    ref: str | None = Field(
        default=None,
        description="Target element ref ID from read_page or find (e.g., 'ref_5'). Preferred over selector."
    )
    selector: str | None = Field(
        default=None,
        description="CSS selector or text=/label=/role= shortcut. Fallback when ref is unavailable."
    )
    text: str | None = Field(
        default=None,
        description="Text to type (type/input) or text to match."
    )
    value: Any | None = Field(
        default=None,
        description="Value to set/select; for navigate pass the URL here."
    )
    key: str | None = Field(
        default=None,
        description="Single key to press for press actions (e.g., 'Enter', 'Escape')."
    )
    keys: list[str] | None = Field(
        default=None,
        description="Ordered list of keys for multi-key press actions (e.g., ['Control', 'K'])."
    )
    delay_ms: int | None = Field(
        default=None,
        alias="delayMs",
        description="Milliseconds to wait after this action (0-10000) to let the UI settle."
    )


class FrontendActionsInput(BaseModel):
    goal: str = Field(
        description="Short outcome label for the action sequence (e.g., 'Apply date filter', 'Create new feature')."
    )
    actions: list[FrontendActionInput] = Field(
        default_factory=list,
        description="Ordered list of UI actions. Use ref IDs from read_page/find for targeting."
    )


class JsExecInput(BaseModel):
    code: str = Field(
        description="JavaScript code to execute in the page context. The result of the last expression is returned."
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
            "If the list is empty, no backend action fits—use read_page to observe the page."
        ),
        args_schema=FindActionsInput
    )


def create_read_page_tool() -> StructuredTool:
    def read_page(**_kwargs: Any) -> str:
        return json.dumps({"status": "queued"})

    return StructuredTool.from_function(
        func=read_page,
        name="read_page",
        description=(
            "Task: Get an accessibility tree of the current page with ref IDs for each element. "
            "Returns a hierarchical text representation showing role, name, state, and ref ID for each node. "
            "Use filter='interactive' for just buttons/links/inputs. "
            "Use refId to scope to a subtree of a known element. "
            "Includes a screenshot when screen sharing is active. "
            "Output: Compact text tree with ref IDs that can be used in frontend actions."
        ),
        args_schema=ReadPageInput
    )


def create_find_elements_tool() -> StructuredTool:
    def find_elements(**_kwargs: Any) -> str:
        return json.dumps({"status": "queued"})

    return StructuredTool.from_function(
        func=find_elements,
        name="find_elements",
        description=(
            "Task: Search for elements by natural language description. "
            "Returns up to 20 matching elements with ref IDs. "
            "Faster and more focused than read_page for targeted searches. "
            "Output: List of matching elements with ref, role, name, states."
        ),
        args_schema=FindElementsInput
    )


def create_frontend_actions_tool() -> StructuredTool:
    def frontend(**_kwargs: Any) -> str:
        return json.dumps({"status": "queued"})

    return StructuredTool.from_function(
        func=frontend,
        name="frontend",
        description=(
            "Task: Execute frontend UI actions in order. "
            "Use ref IDs from read_page/find to target elements. Falls back to CSS selectors. "
            "Output: Per-action results with status."
        ),
        args_schema=FrontendActionsInput
    )


def create_js_exec_tool() -> StructuredTool:
    def js_exec(**_kwargs: Any) -> str:
        return json.dumps({"status": "queued"})

    return StructuredTool.from_function(
        func=js_exec,
        name="js_exec",
        description=(
            "Task: Execute JavaScript in the page context. "
            "Use as escape hatch for interactions that standard actions cannot handle. "
            "Output: Result of the last expression."
        ),
        args_schema=JsExecInput
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
