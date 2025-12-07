from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, cast, func, or_, select, String
from sqlalchemy.orm import Session, selectinload

from ..core.logger import log_info
from ..models import Endpoint, Feature
from ..schemas.endpoint import EndpointPayload
from ..schemas.feature import FeatureSelector
from .embedding_service import delete_endpoint_embedding, upsert_endpoint_embedding
from .feature_classifier import classify_feature_name
from .user_stats_service import adjust_endpoint_count


def _normalize_name(name: str) -> str:
    return name.strip()


def _get_feature(session: Session, feature_id: UUID, user_id: str, load_endpoints: bool = False) -> Feature:
    query = select(Feature).where(and_(Feature.id == feature_id, Feature.user_id == user_id))
    if load_endpoints:
        query = query.options(selectinload(Feature.endpoints))
    feature = session.scalar(query)
    if not feature:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature not found")
    return feature


def _find_feature_by_name(session: Session, user_id: str, name: str) -> Feature | None:
    return session.scalar(
        select(Feature)
        .where(Feature.user_id == user_id)
        .where(func.lower(Feature.name) == func.lower(name))
    )


def _feature_search_condition(search: str | None):
    if not search:
        return None
    terms = [term.strip().lower() for term in search.split() if term.strip()]
    if not terms:
        return None
    feature_name = func.lower(func.coalesce(Feature.name, ""))
    tool_name = cast(Endpoint.tool["function"]["name"], String)
    tool_description = cast(Endpoint.tool["function"]["description"], String)
    normalized_path = func.lower(func.coalesce(Endpoint.path, ""))
    normalized_tool_name = func.lower(func.coalesce(tool_name, ""))
    normalized_description = func.lower(func.coalesce(tool_description, ""))
    predicates = []
    for term in terms:
        pattern = f"%{term}%"
        predicates.append(
            or_(feature_name.like(pattern), normalized_path.like(pattern), normalized_tool_name.like(pattern), normalized_description.like(pattern))
        )
    return and_(*predicates)


def list_features(session: Session, user_id: str, search: str | None = None) -> list[Feature]:
    condition = _feature_search_condition(search)
    query = select(Feature).where(Feature.user_id == user_id).options(
        selectinload(Feature.endpoints)
    ).order_by(Feature.created_at.desc())
    if condition is not None:
        query = query.outerjoin(Endpoint, Endpoint.feature_id == Feature.id).where(condition).distinct()
    return list(session.scalars(query).all())


def create_feature(session: Session, user_id: str, name: str) -> Feature:
    normalized = _normalize_name(name)
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Feature name is required")
    existing = _find_feature_by_name(session, user_id, normalized)
    if existing:
        return existing
    feature = Feature(user_id=user_id, name=normalized)
    session.add(feature)
    session.flush()
    log_info("FeatureService", "create_feature", "Feature created", user_id=user_id, feature_id=str(feature.id))
    return feature


def update_feature(session: Session, feature_id: UUID, user_id: str, name: str) -> Feature:
    normalized = _normalize_name(name)
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Feature name is required")
    feature = _get_feature(session, feature_id, user_id, load_endpoints=False)
    existing = _find_feature_by_name(session, user_id, normalized)
    if existing and existing.id != feature_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Feature name already exists")
    feature.name = normalized
    feature.updated_at = func.now()
    session.flush()
    log_info("FeatureService", "update_feature", "Feature renamed", user_id=user_id, feature_id=str(feature_id))
    return feature


def delete_feature(session: Session, feature_id: UUID, user_id: str) -> None:
    feature = _get_feature(session, feature_id, user_id, load_endpoints=True)
    endpoint_total = len(feature.endpoints)
    for endpoint in list(feature.endpoints):
        delete_endpoint_embedding(session, endpoint.id)
    session.delete(feature)
    session.flush()
    if endpoint_total:
        adjust_endpoint_count(session, user_id, -endpoint_total)
    log_info("FeatureService", "delete_feature", "Feature deleted", user_id=user_id, feature_id=str(feature_id))


def set_feature_enabled(session: Session, feature_id: UUID, user_id: str, enabled: bool) -> Feature:
    feature = _get_feature(session, feature_id, user_id, load_endpoints=True)
    changes = 0
    for endpoint in feature.endpoints:
        if endpoint.agent_enabled == enabled:
            continue
        endpoint.agent_enabled = enabled
        endpoint.updated_at = func.now()
        changes += 1
        if enabled:
            upsert_endpoint_embedding(session, endpoint.id, user_id)
        else:
            delete_endpoint_embedding(session, endpoint.id)
    if changes:
        feature.updated_at = func.now()
        session.flush()
    log_info("FeatureService", "set_feature_enabled", "Feature toggled", user_id=user_id, feature_id=str(feature_id), enabled=enabled)
    return feature


def resolve_feature(session: Session, user_id: str, selector: FeatureSelector, endpoint_payload: EndpointPayload) -> Feature:
    if selector.mode == "existing":
        return _get_feature(session, selector.id, user_id)
    if selector.mode == "new":
        return create_feature(session, user_id, selector.name or "")
    current = list(session.scalars(select(Feature).where(Feature.user_id == user_id)).all())
    feature_name = classify_feature_name(endpoint_payload.model_dump(mode="json"), [item.name for item in current])
    match = next((item for item in current if item.name.lower() == feature_name.lower()), None)
    if match:
        return match
    return create_feature(session, user_id, feature_name)


def delete_feature_if_empty(session: Session, feature_id: UUID, user_id: str) -> None:
    feature = _get_feature(session, feature_id, user_id, load_endpoints=True)
    if feature.endpoints:
        return None
    session.delete(feature)
    session.flush()
    log_info("FeatureService", "delete_feature_if_empty", "Deleted empty feature", user_id=user_id, feature_id=str(feature_id))
