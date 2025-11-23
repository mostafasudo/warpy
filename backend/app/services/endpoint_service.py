from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Endpoint
from ..schemas.endpoint import EndpointPayload


def _endpoint_condition(endpoint_id: UUID):
    return Endpoint.id == endpoint_id


def _get_endpoint(session: Session, endpoint_id: UUID) -> Endpoint:
    endpoint = session.scalar(select(Endpoint).where(_endpoint_condition(endpoint_id)))
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")
    return endpoint


def list_endpoints(session: Session, page: int, page_size: int) -> tuple[list[Endpoint], int]:
    if page < 1 or page_size < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pagination parameters")
    total = session.scalar(select(func.count()).select_from(Endpoint)) or 0
    items = session.scalars(
        select(Endpoint)
        .order_by(Endpoint.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return items, total


def create_endpoint(session: Session, payload: EndpointPayload) -> Endpoint:
    endpoint = Endpoint(path=payload.path, method=payload.method, tool=payload.tool)
    session.add(endpoint)
    session.flush()
    return endpoint


def update_endpoint(session: Session, endpoint_id: UUID, payload: EndpointPayload) -> Endpoint:
    endpoint = _get_endpoint(session, endpoint_id)
    endpoint.path = payload.path
    endpoint.method = payload.method
    endpoint.tool = payload.tool
    endpoint.updated_at = func.now()
    session.flush()
    return endpoint


def delete_endpoint(session: Session, endpoint_id: UUID) -> None:
    endpoint = _get_endpoint(session, endpoint_id)
    session.delete(endpoint)
    session.flush()
