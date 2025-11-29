from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, cast, func, or_, select, String
from sqlalchemy.orm import Session

from ..models import Endpoint
from ..schemas.endpoint import EndpointPayload
from .embedding_service import delete_endpoint_embedding, upsert_endpoint_embedding


def _validate_tool(tool: dict[str, Any]) -> None:
    function = tool.get("function") if isinstance(tool, dict) else None
    name = function.get("name") if isinstance(function, dict) else None
    description = function.get("description") if isinstance(function, dict) else None
    if not isinstance(name, str) or not name.strip() or not isinstance(description, str) or not description.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tool name and description are required"
        )


def _endpoint_condition(endpoint_id: UUID):
    return Endpoint.id == endpoint_id


def _get_endpoint(session: Session, endpoint_id: UUID, user_id: str) -> Endpoint:
    endpoint = session.scalar(select(Endpoint).where(and_(_endpoint_condition(endpoint_id), Endpoint.user_id == user_id)))
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")
    return endpoint


def _search_condition(search: str | None):
    if not search:
        return None
    terms = [term.strip().lower() for term in search.split() if term.strip()]
    if not terms:
        return None
    tool_name = cast(Endpoint.tool["function"]["name"], String)
    tool_description = cast(Endpoint.tool["function"]["description"], String)
    normalized_path = func.lower(func.coalesce(Endpoint.path, ""))
    normalized_name = func.lower(func.coalesce(tool_name, ""))
    normalized_description = func.lower(func.coalesce(tool_description, ""))
    def make_predicate(term: str):
        pattern = f"%{term}%"
        return or_(
            normalized_path.like(pattern),
            normalized_name.like(pattern),
            normalized_description.like(pattern)
        )
    return and_(*[make_predicate(term) for term in terms])


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
    )
    if condition is not None:
        count_query = count_query.where(condition)
        items_query = items_query.where(condition)
    total = session.scalar(count_query) or 0
    items = session.scalars(items_query).all()
    return items, total


def create_endpoint(session: Session, user_id: str, payload: EndpointPayload) -> Endpoint:
    _validate_tool(payload.tool)
    endpoint = Endpoint(user_id=user_id, path=payload.path, method=payload.method, tool=payload.tool)
    session.add(endpoint)
    session.flush()
    upsert_endpoint_embedding(session, endpoint.id, user_id)
    return endpoint


def update_endpoint(session: Session, endpoint_id: UUID, user_id: str, payload: EndpointPayload) -> Endpoint:
    _validate_tool(payload.tool)
    endpoint = _get_endpoint(session, endpoint_id, user_id)
    endpoint.path = payload.path
    endpoint.method = payload.method
    endpoint.tool = payload.tool
    endpoint.updated_at = func.now()
    session.flush()
    upsert_endpoint_embedding(session, endpoint.id, user_id)
    return endpoint


def delete_endpoint(session: Session, endpoint_id: UUID, user_id: str) -> None:
    endpoint = _get_endpoint(session, endpoint_id, user_id)
    delete_endpoint_embedding(session, endpoint_id)
    session.delete(endpoint)
    session.flush()
