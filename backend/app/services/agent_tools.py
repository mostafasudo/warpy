import json
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable, ContextManager
from uuid import UUID

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Tool
from .embedding_service import search_similar_tools
from .agent_execution import execute_backend_tool, get_enabled_tool
from .agent_schema import SchemaFactory, serialize_args
from .mcp_runtime import McpToolSnapshot, make_db_tool_ref


@dataclass(frozen=True)
class ToolSnapshot:
    id: UUID
    tool_type: str
    method: str | None
    path: str | None
    name: str
    description: str
    parameters: dict[str, Any]

    @classmethod
    def from_record(cls, tool: Tool) -> "ToolSnapshot":
        tool_spec = tool.tool or {}
        function_spec = tool_spec.get("function", {})
        default_method = tool.method.value if tool.method else "GET"
        default_path = tool.path or "/"
        return cls(
            id=tool.id,
            tool_type=getattr(tool, "tool_type", "backend"),
            method=tool.method.value if tool.method else None,
            path=tool.path,
            name=function_spec.get("name", f"tool_{tool.id}"),
            description=function_spec.get("description", f"{default_method} {default_path}"),
            parameters=function_spec.get("parameters", {"type": "object", "properties": {}}),
        )

    def to_metadata(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "ref": make_db_tool_ref(self.id),
            "toolType": self.tool_type,
            "method": self.method,
            "path": self.path,
            "name": self.name,
            "description": self.description,
        }


SessionProvider = Callable[[], ContextManager[Session]]


@contextmanager
def _session_context(session: Session | None, session_provider: SessionProvider | None):
    if session_provider is not None:
        with session_provider() as provided_session:
            yield provided_session
        return
    if session is None:
        raise RuntimeError("Agent tool execution requires a database session")
    yield session


def _load_agent_tools_from_session(session: Session, user_id: str, tool_ids: list[UUID]) -> list[Tool]:
    if not tool_ids:
        return []
    return session.scalars(
        select(Tool).where(
            Tool.id.in_(tool_ids),
            Tool.user_id == user_id,
            Tool.agent_enabled.is_(True),
        )
    ).all()


class FindToolsInput(BaseModel):
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
        description="Short outcome label for the screen autopilot action sequence (e.g., 'Apply date filter', 'Create new feature')."
    )
    actions: list[FrontendActionInput] = Field(
        default_factory=list,
        description="Ordered list of screen autopilot actions. Use ref IDs from read_page/find_elements for targeting."
    )


class JsExecInput(BaseModel):
    code: str = Field(
        description="JavaScript code to execute in the page context. The result of the last expression is returned."
    )


def create_find_tools_tool(
    session: Session | None,
    user_id: str,
    *,
    session_provider: SessionProvider | None = None,
) -> StructuredTool:
    def find_tools(query: str) -> str:
        with _session_context(session, session_provider) as db_session:
            tool_ids = search_similar_tools(db_session, user_id, query)
            if not tool_ids:
                return json.dumps([], indent=2)
            tools = db_session.scalars(
                select(Tool).where(
                    Tool.id.in_(tool_ids),
                    Tool.user_id == user_id,
                    Tool.agent_enabled.is_(True),
                ).options(selectinload(Tool.feature))
            ).all()
            if not tools:
                return json.dumps([], indent=2)
            result = []
            for tool in tools:
                tool_spec = tool.tool or {}
                function = tool_spec.get("function", {})
                is_backend = getattr(tool, "tool_type", "backend") == "backend"
                result.append(
                    {
                        "id": make_db_tool_ref(tool.id),
                        "toolType": "backend" if is_backend else "frontend",
                        "method": tool.method.value if is_backend and tool.method else None,
                        "path": tool.path if is_backend else None,
                        "name": function.get("name", ""),
                        "description": function.get("description", ""),
                        "feature": getattr(tool.feature, "name", ""),
                    }
                )
            return json.dumps(result, indent=2)

    return StructuredTool.from_function(
        func=find_tools,
        name="find_tools",
        description=(
            "Task: Find relevant tools for the user's request. "
            "Use when you need available tools or are unsure what to call first. "
            "Returns both backend and frontend tools. "
            "Backend tools call dashboard APIs/services (method/path shown). "
            "Frontend tools call browser handlers in the user's app (toolType='frontend'). "
            "Output: JSON list with id, toolType, method/path (backend only), name, description, feature."
        ),
        args_schema=FindToolsInput
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
            "Output: Compact text tree with ref IDs that can be used in screen autopilot actions."
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
            "Task: Execute screen autopilot actions against the current page DOM in order. "
            "Use ref IDs from read_page/find_elements to target elements. Falls back to CSS selectors. "
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


def create_backend_tool(
    session: Session | None,
    user_id: str,
    tool: Tool | ToolSnapshot,
    schema_factory: SchemaFactory | None = None,
    conversation_id: UUID | None = None,
    *,
    session_provider: SessionProvider | None = None,
) -> StructuredTool:
    factory = schema_factory or SchemaFactory()
    snapshot = tool if isinstance(tool, ToolSnapshot) else ToolSnapshot.from_record(tool)
    InputModel = factory.model_from_schema(f"{snapshot.name}Input", snapshot.parameters)

    def execute_func(**kwargs: Any) -> str:
        serialized = serialize_args(kwargs)
        filtered = {key: value for key, value in serialized.items() if value is not None}
        with _session_context(session, session_provider) as db_session:
            if session_provider is not None or isinstance(tool, ToolSnapshot):
                tool_record = get_enabled_tool(db_session, user_id, snapshot.id)
            else:
                tool_record = tool
            if not tool_record:
                return json.dumps({"error": f"Tool '{snapshot.name}' not found"}, indent=2)
            result = execute_backend_tool(
                db_session,
                user_id,
                tool_record,
                filtered,
                conversation_id=conversation_id,
            )
        return json.dumps(result, indent=2)

    structured_tool = StructuredTool.from_function(
        func=execute_func,
        name=snapshot.name,
        description=snapshot.description,
        args_schema=InputModel
    )
    structured_tool.metadata = {**(structured_tool.metadata or {}), "warpy_tool": snapshot.to_metadata()}
    return structured_tool


def create_frontend_tool(tool: Tool | ToolSnapshot, schema_factory: SchemaFactory | None = None) -> StructuredTool:
    factory = schema_factory or SchemaFactory()
    snapshot = tool if isinstance(tool, ToolSnapshot) else ToolSnapshot.from_record(tool)
    InputModel = factory.model_from_schema(f"{snapshot.name}Input", snapshot.parameters)

    def execute_func(**_kwargs: Any) -> str:
        return json.dumps({"status": "queued"})

    structured_tool = StructuredTool.from_function(
        func=execute_func,
        name=snapshot.name,
        description=snapshot.description or "Run a frontend tool handler in the browser",
        args_schema=InputModel
    )
    structured_tool.metadata = {**(structured_tool.metadata or {}), "warpy_tool": snapshot.to_metadata()}
    return structured_tool


def create_mcp_tool(snapshot: McpToolSnapshot, schema_factory: SchemaFactory | None = None) -> StructuredTool:
    factory = schema_factory or SchemaFactory()
    InputModel = factory.model_from_schema(f"{snapshot.alias_name}Input", snapshot.input_schema)

    def execute_func(**_kwargs: Any) -> str:
        return json.dumps({"status": "queued"})

    structured_tool = StructuredTool.from_function(
        func=execute_func,
        name=snapshot.alias_name,
        description=snapshot.description or f"Call MCP tool {snapshot.server_tool_name}",
        args_schema=InputModel,
    )
    structured_tool.metadata = {**(structured_tool.metadata or {}), "warpy_tool": snapshot.to_metadata()}
    return structured_tool



class SearchKnowledgeBaseInput(BaseModel):
    query: str = Field(
        description="Search query to find relevant information from knowledge-base documents or public websites."
    )


def create_search_knowledge_base_tool(
    session: Session | None,
    user_id: str,
    *,
    session_provider: SessionProvider | None = None,
) -> StructuredTool:
    def search_kb(query: str) -> str:
        from .knowledge_embedding_service import search_knowledge_base
        with _session_context(session, session_provider) as db_session:
            results = search_knowledge_base(db_session, user_id, query)
            if not results:
                return json.dumps({"results": [], "message": "I couldn't find a matching answer in the knowledge base."})
            return json.dumps({"results": results}, indent=2)

    return StructuredTool.from_function(
        func=search_kb,
        name="search_knowledge_base",
        description=(
            "Task: Search the knowledge base for relevant product information. "
            "Use when the user asks questions that might be answered by uploaded documents or public website content. "
            "Returns source-aware evidence with the matching text, page or document title, section title, and source URL. "
            "Output: JSON with evidence objects in the shape snippet/title/sectionTitle/sourceUrl/sourceKind."
        ),
        args_schema=SearchKnowledgeBaseInput,
    )


def get_agent_tools(
    session: Session | None,
    user_id: str,
    tool_ids: list[UUID],
    schema_factory: SchemaFactory | None = None,
    conversation_id: UUID | None = None,
    *,
    session_provider: SessionProvider | None = None,
) -> list[StructuredTool]:
    if not tool_ids:
        return []
    factory = schema_factory or SchemaFactory()
    if session_provider is not None:
        with _session_context(session, session_provider) as db_session:
            snapshots = [ToolSnapshot.from_record(tool) for tool in _load_agent_tools_from_session(db_session, user_id, tool_ids)]
        agent_tools: list[StructuredTool] = []
        for snapshot in snapshots:
            if snapshot.tool_type == "frontend":
                agent_tools.append(create_frontend_tool(snapshot, factory))
                continue
            agent_tools.append(
                create_backend_tool(
                    None,
                    user_id,
                    snapshot,
                    factory,
                    conversation_id=conversation_id,
                    session_provider=session_provider,
                )
            )
        return agent_tools

    tools = _load_agent_tools_from_session(session, user_id, tool_ids)
    agent_tools: list[StructuredTool] = []
    for tool in tools:
        if getattr(tool, "tool_type", "backend") == "frontend":
            agent_tools.append(create_frontend_tool(tool, factory))
            continue
        agent_tools.append(create_backend_tool(session, user_id, tool, factory, conversation_id=conversation_id))
    return agent_tools
