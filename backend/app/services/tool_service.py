from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, cast, func, or_, select, String
from sqlalchemy.orm import Session, selectinload

from ..models import Tool, Feature, HttpMethod
from ..schemas.tool import ToolPayload
from .embedding_service import delete_tool_embedding
from ..workers.embedding_jobs import enqueue_tool_embedding
from .feature_service import resolve_feature
from .user_stats_service import adjust_tool_count, get_tool_count

RESERVED_TOOL_NAMES = {"find_tools", "find_actions", "read_page", "find_elements", "frontend", "js_exec", "search_knowledge_base"}


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _validate_tool(tool: dict[str, Any], method: HttpMethod | None, tool_type: str) -> None:
    function = tool.get("function") if isinstance(tool, dict) else None
    name = function.get("name") if isinstance(function, dict) else None
    description = function.get("description") if isinstance(function, dict) else None
    if not isinstance(name, str) or not name.strip() or not isinstance(description, str) or not description.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tool name and description are required"
        )
    if name.strip().lower() in RESERVED_TOOL_NAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tool name is reserved"
        )
    if tool_type != "backend":
        return
    if method == HttpMethod.get:
        parameters = function.get("parameters") if isinstance(function, dict) else None
        properties = parameters.get("properties") if isinstance(parameters, dict) else {}
        body_schema = properties.get("body") if isinstance(properties, dict) else None
        if body_schema:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GET backend tools cannot include a body"
            )


def _tool_condition(tool_id: UUID):
    return Tool.id == tool_id


def _get_tool(session: Session, tool_id: UUID, user_id: str) -> Tool:
    tool = session.scalar(
        select(Tool)
        .where(and_(_tool_condition(tool_id), Tool.user_id == user_id))
        .options(selectinload(Tool.feature))
    )
    if not tool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")
    return tool


def _search_condition(search: str | None):
    if not search:
        return None
    terms = [term.strip().lower() for term in search.split() if term.strip()]
    if not terms:
        return None
    feature_name = func.lower(func.coalesce(Feature.name, ""))
    tool_name = cast(Tool.tool["function"]["name"], String)
    tool_description = cast(Tool.tool["function"]["description"], String)
    normalized_path = func.lower(func.coalesce(Tool.path, ""))
    normalized_name = func.lower(func.coalesce(tool_name, ""))
    normalized_description = func.lower(func.coalesce(tool_description, ""))
    predicates = []
    for term in terms:
        pattern = f"%{_escape_like(term)}%"
        predicates.append(
            or_(
                normalized_path.like(pattern, escape="\\"),
                normalized_name.like(pattern, escape="\\"),
                normalized_description.like(pattern, escape="\\"),
                Tool.feature.has(feature_name.like(pattern, escape="\\"))
            )
        )
    return and_(*predicates)


def list_tools(session: Session, user_id: str, page: int, page_size: int, search: str | None = None) -> tuple[list[Tool], int]:
    if page < 1 or page_size < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pagination parameters")
    condition = _search_condition(search)
    count_query = select(func.count()).select_from(Tool).where(Tool.user_id == user_id)
    items_query = (
        select(Tool)
        .where(Tool.user_id == user_id)
        .order_by(Tool.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .options(selectinload(Tool.feature).selectinload(Feature.tools))
    )
    if condition is not None:
        count_query = count_query.where(condition)
        items_query = items_query.where(condition)
        total = session.scalar(count_query) or 0
    else:
        total = get_tool_count(session, user_id)
    items = session.scalars(items_query).all()
    return items, total


def create_tool(session: Session, user_id: str, payload: ToolPayload) -> Tool:
    _validate_tool(payload.tool, payload.method, payload.tool_type)
    feature = resolve_feature(session, user_id, payload.feature, payload)
    path = (payload.path or "").strip() if payload.tool_type == "backend" else None
    method = payload.method if payload.tool_type == "backend" else None
    tool = Tool(
        user_id=user_id,
        tool_type=payload.tool_type,
        path=path,
        method=method,
        tool=payload.tool,
        feature_id=feature.id,
        agent_enabled=payload.agent_enabled
    )
    session.add(tool)
    session.flush()
    adjust_tool_count(session, user_id, 1)
    if tool.agent_enabled:
        enqueue_tool_embedding(tool.id, user_id)
    return tool


def update_tool(session: Session, tool_id: UUID, user_id: str, payload: ToolPayload) -> Tool:
    _validate_tool(payload.tool, payload.method, payload.tool_type)
    tool = _get_tool(session, tool_id, user_id)
    target_feature = resolve_feature(session, user_id, payload.feature, payload)
    path = (payload.path or "").strip() if payload.tool_type == "backend" else None
    method = payload.method if payload.tool_type == "backend" else None
    previous_agent_enabled = tool.agent_enabled
    tool.tool_type = payload.tool_type
    tool.path = path
    tool.method = method
    tool.tool = payload.tool
    tool.feature_id = target_feature.id
    tool.agent_enabled = payload.agent_enabled
    tool.updated_at = func.now()
    session.flush()
    if tool.agent_enabled:
        enqueue_tool_embedding(tool.id, user_id)
    elif previous_agent_enabled:
        delete_tool_embedding(session, tool.id)
    return tool


def delete_tool(session: Session, tool_id: UUID, user_id: str) -> None:
    tool = _get_tool(session, tool_id, user_id)
    delete_tool_embedding(session, tool_id)
    session.delete(tool)
    session.flush()
    adjust_tool_count(session, user_id, -1)
