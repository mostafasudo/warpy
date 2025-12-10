from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, cast, func, or_, select, String
from sqlalchemy.orm import Session, selectinload

from ..models import Endpoint, Feature, HttpMethod
from ..schemas.endpoint import EndpointPayload
from .embedding_service import delete_endpoint_embedding
from ..workers.embedding_jobs import enqueue_endpoint_embedding
from .feature_service import resolve_feature
from .user_stats_service import adjust_endpoint_count, get_endpoint_count


def _validate_tool(tool: dict[str, Any], method: HttpMethod) -> None:
    function = tool.get("function") if isinstance(tool, dict) else None
    name = function.get("name") if isinstance(function, dict) else None
    description = function.get("description") if isinstance(function, dict) else None
    if not isinstance(name, str) or not name.strip() or not isinstance(description, str) or not description.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tool name and description are required"
        )
    if method == HttpMethod.get:
        parameters = function.get("parameters") if isinstance(function, dict) else None
        properties = parameters.get("properties") if isinstance(parameters, dict) else {}
        body_schema = properties.get("body") if isinstance(properties, dict) else None
        if body_schema:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GET endpoints cannot include a body"
            )


def _endpoint_condition(endpoint_id: UUID):
    return Endpoint.id == endpoint_id


def _get_endpoint(session: Session, endpoint_id: UUID, user_id: str) -> Endpoint:
    endpoint = session.scalar(
        select(Endpoint)
        .where(and_(_endpoint_condition(endpoint_id), Endpoint.user_id == user_id))
        .options(selectinload(Endpoint.feature))
    )
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")
    return endpoint


def _search_condition(search: str | None):
    if not search:
        return None
    terms = [term.strip().lower() for term in search.split() if term.strip()]
    if not terms:
        return None
    feature_name = func.lower(func.coalesce(Feature.name, ""))
    tool_name = cast(Endpoint.tool["function"]["name"], String)
    tool_description = cast(Endpoint.tool["function"]["description"], String)
    normalized_path = func.lower(func.coalesce(Endpoint.path, ""))
    normalized_name = func.lower(func.coalesce(tool_name, ""))
    normalized_description = func.lower(func.coalesce(tool_description, ""))
    predicates = []
    for term in terms:
        pattern = f"%{term}%"
        predicates.append(
            or_(
                normalized_path.like(pattern),
                normalized_name.like(pattern),
                normalized_description.like(pattern),
                Endpoint.feature.has(feature_name.like(pattern))
            )
        )
    return and_(*predicates)


def list_endpoints(session: Session, user_id: str, page: int, page_size: int, search: str | None = None) -> tuple[list[Endpoint], int]:
    if page < 1 or page_size < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pagination parameters")
    condition = _search_condition(search)
    count_query = select(func.count()).select_from(Endpoint).where(Endpoint.user_id == user_id)
    items_query = (
        select(Endpoint)
        .where(Endpoint.user_id == user_id)
        .order_by(Endpoint.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .options(selectinload(Endpoint.feature).selectinload(Feature.endpoints))
    )
    if condition is not None:
        count_query = count_query.where(condition)
        items_query = items_query.where(condition)
        total = session.scalar(count_query) or 0
    else:
        total = get_endpoint_count(session, user_id)
    items = session.scalars(items_query).all()
    return items, total


def create_endpoint(session: Session, user_id: str, payload: EndpointPayload) -> Endpoint:
    _validate_tool(payload.tool, payload.method)
    feature = resolve_feature(session, user_id, payload.feature, payload)
    endpoint = Endpoint(
        user_id=user_id,
        path=payload.path,
        method=payload.method,
        tool=payload.tool,
        feature_id=feature.id,
        agent_enabled=payload.agent_enabled
    )
    session.add(endpoint)
    session.flush()
    adjust_endpoint_count(session, user_id, 1)
    if endpoint.agent_enabled:
        enqueue_endpoint_embedding(endpoint.id, user_id)
    return endpoint


def update_endpoint(session: Session, endpoint_id: UUID, user_id: str, payload: EndpointPayload) -> Endpoint:
    _validate_tool(payload.tool, payload.method)
    endpoint = _get_endpoint(session, endpoint_id, user_id)
    target_feature = resolve_feature(session, user_id, payload.feature, payload)
    previous_agent_enabled = endpoint.agent_enabled
    endpoint.path = payload.path
    endpoint.method = payload.method
    endpoint.tool = payload.tool
    endpoint.feature_id = target_feature.id
    endpoint.agent_enabled = payload.agent_enabled
    endpoint.updated_at = func.now()
    session.flush()
    if endpoint.agent_enabled:
        enqueue_endpoint_embedding(endpoint.id, user_id)
    elif previous_agent_enabled:
        delete_endpoint_embedding(session, endpoint.id)
    return endpoint


def delete_endpoint(session: Session, endpoint_id: UUID, user_id: str) -> None:
    endpoint = _get_endpoint(session, endpoint_id, user_id)
    delete_endpoint_embedding(session, endpoint_id)
    session.delete(endpoint)
    session.flush()
    adjust_endpoint_count(session, user_id, -1)
