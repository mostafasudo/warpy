from math import ceil
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, cast, func, or_, select, String
from sqlalchemy.orm import Session, selectinload

from ..core.logger import log_info
from ..models import Tool, Feature
from ..schemas.tool import ToolPayload
from ..schemas.feature import FeatureSelector, ToolPagination
from .embedding_service import delete_tool_embedding
from .feature_classifier import classify_feature_name
from .user_stats_service import adjust_tool_count
from ..workers.embedding_jobs import enqueue_tool_embedding

TOOLS_PAGE_SIZE = 5


def _normalize_name(name: str) -> str:
    return name.strip()


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _get_feature(session: Session, feature_id: UUID, user_id: str, load_tools: bool = False) -> Feature:
    query = select(Feature).where(and_(Feature.id == feature_id, Feature.user_id == user_id))
    if load_tools:
        query = query.options(selectinload(Feature.tools))
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
    tool_name = cast(Tool.tool["function"]["name"], String)
    tool_description = cast(Tool.tool["function"]["description"], String)
    normalized_path = func.lower(func.coalesce(Tool.path, ""))
    normalized_tool_name = func.lower(func.coalesce(tool_name, ""))
    normalized_description = func.lower(func.coalesce(tool_description, ""))
    predicates = []
    for term in terms:
        pattern = f"%{_escape_like(term)}%"
        predicates.append(
            or_(
                feature_name.like(pattern, escape="\\"),
                normalized_path.like(pattern, escape="\\"),
                normalized_tool_name.like(pattern, escape="\\"),
                normalized_description.like(pattern, escape="\\"),
            )
        )
    return and_(*predicates)


def _get_feature_tool_counts(session: Session, feature_ids: list[UUID]) -> dict[UUID, int]:
    if not feature_ids:
        return {}
    rows = session.execute(
        select(Tool.feature_id, func.count(Tool.id))
        .where(Tool.feature_id.in_(feature_ids))
        .group_by(Tool.feature_id)
    ).all()
    return {row[0]: row[1] for row in rows}


def _get_feature_backend_tool_counts(session: Session, feature_ids: list[UUID]) -> dict[UUID, int]:
    if not feature_ids:
        return {}
    rows = session.execute(
        select(Tool.feature_id, func.count(Tool.id))
        .where(Tool.feature_id.in_(feature_ids), Tool.tool_type == "backend")
        .group_by(Tool.feature_id)
    ).all()
    return {row[0]: row[1] for row in rows}


def _get_feature_enabled_states(session: Session, feature_ids: list[UUID]) -> dict[UUID, tuple[int, int]]:
    if not feature_ids:
        return {}
    from sqlalchemy import case

    enabled_case = case((Tool.agent_enabled == True, 1), else_=0)
    rows = session.execute(
        select(
            Tool.feature_id,
            func.sum(enabled_case),
            func.count(Tool.id)
        )
        .where(Tool.feature_id.in_(feature_ids))
        .group_by(Tool.feature_id)
    ).all()
    return {row[0]: (int(row[1] or 0), row[2]) for row in rows}


def _compute_enabled_state(enabled_count: int, total: int) -> str:
    if total == 0:
        return "disabled"
    if enabled_count == total:
        return "enabled"
    if enabled_count > 0:
        return "partial"
    return "disabled"


class FeatureWithPagination:
    def __init__(
        self,
        feature: Feature,
        tools: list[Tool],
        tool_count: int,
        backend_tool_count: int,
        enabled_state: str,
        pagination: ToolPagination
    ):
        self.id = feature.id
        self.name = feature.name
        self.tool_count = tool_count
        self.backend_tool_count = backend_tool_count
        self.enabled_state = enabled_state
        self.tools = tools
        self.pagination = pagination


def _get_paginated_tools_by_feature(
    session: Session,
    feature_ids: list[UUID],
    page: int
) -> dict[UUID, list[Tool]]:
    if not feature_ids:
        return {}
    offset = (page - 1) * TOOLS_PAGE_SIZE
    row_num = func.row_number().over(
        partition_by=Tool.feature_id,
        order_by=[Tool.created_at, Tool.id]
    ).label("row_num")
    subq = (
        select(Tool.id, row_num)
        .where(Tool.feature_id.in_(feature_ids))
        .subquery()
    )
    tool_ids = session.scalars(
        select(subq.c.id)
        .where(subq.c.row_num > offset)
        .where(subq.c.row_num <= offset + TOOLS_PAGE_SIZE)
    ).all()
    if not tool_ids:
        return {fid: [] for fid in feature_ids}
    tools = session.scalars(
        select(Tool)
        .where(Tool.id.in_(tool_ids))
        .order_by(Tool.feature_id, Tool.created_at, Tool.id)
    ).all()
    result: dict[UUID, list[Tool]] = {fid: [] for fid in feature_ids}
    for tool in tools:
        result[tool.feature_id].append(tool)
    return result


def list_features(
    session: Session,
    user_id: str,
    search: str | None = None,
    tool_page: int = 1
) -> list[FeatureWithPagination]:
    condition = _feature_search_condition(search)
    query = select(Feature).where(Feature.user_id == user_id).order_by(Feature.created_at.desc())
    if condition is not None:
        query = query.outerjoin(Tool, Tool.feature_id == Feature.id).where(condition).distinct()
    features = list(session.scalars(query).all())
    if not features:
        return []
    feature_ids = [f.id for f in features]
    counts = _get_feature_tool_counts(session, feature_ids)
    backend_counts = _get_feature_backend_tool_counts(session, feature_ids)
    states = _get_feature_enabled_states(session, feature_ids)
    tools_by_feature = _get_paginated_tools_by_feature(session, feature_ids, tool_page)
    result = []
    for feature in features:
        total = counts.get(feature.id, 0)
        backend_total = backend_counts.get(feature.id, 0)
        state_info = states.get(feature.id, (0, 0))
        enabled_state = _compute_enabled_state(state_info[0], state_info[1])
        paged_tools = tools_by_feature.get(feature.id, [])
        total_pages = max(1, ceil(total / TOOLS_PAGE_SIZE))
        pagination = ToolPagination(
            page=tool_page,
            page_size=TOOLS_PAGE_SIZE,
            total=total,
            total_pages=total_pages
        )
        result.append(FeatureWithPagination(feature, paged_tools, total, backend_total, enabled_state, pagination))
    return result


def list_feature_tools(
    session: Session,
    feature_id: UUID,
    user_id: str,
    page: int = 1
) -> tuple[list[Tool], ToolPagination]:
    _get_feature(session, feature_id, user_id)
    total = session.scalar(
        select(func.count(Tool.id)).where(Tool.feature_id == feature_id)
    ) or 0
    offset = (page - 1) * TOOLS_PAGE_SIZE
    tools = list(session.scalars(
        select(Tool)
        .where(Tool.feature_id == feature_id)
        .order_by(Tool.created_at, Tool.id)
        .offset(offset)
        .limit(TOOLS_PAGE_SIZE)
    ).all())
    total_pages = max(1, ceil(total / TOOLS_PAGE_SIZE))
    pagination = ToolPagination(
        page=page,
        page_size=TOOLS_PAGE_SIZE,
        total=total,
        total_pages=total_pages
    )
    return tools, pagination


def _build_feature_with_pagination(
    session: Session,
    feature: Feature,
    page: int = 1
) -> FeatureWithPagination:
    total = session.scalar(
        select(func.count(Tool.id)).where(Tool.feature_id == feature.id)
    ) or 0
    backend_total = session.scalar(
        select(func.count(Tool.id)).where(
            and_(Tool.feature_id == feature.id, Tool.tool_type == "backend")
        )
    ) or 0
    enabled_count = session.scalar(
        select(func.count(Tool.id)).where(
            and_(Tool.feature_id == feature.id, Tool.agent_enabled == True)
        )
    ) or 0
    enabled_state = _compute_enabled_state(enabled_count, total)
    offset = (page - 1) * TOOLS_PAGE_SIZE
    tools = list(session.scalars(
        select(Tool)
        .where(Tool.feature_id == feature.id)
        .order_by(Tool.created_at, Tool.id)
        .offset(offset)
        .limit(TOOLS_PAGE_SIZE)
    ).all())
    total_pages = max(1, ceil(total / TOOLS_PAGE_SIZE))
    pagination = ToolPagination(
        page=page,
        page_size=TOOLS_PAGE_SIZE,
        total=total,
        total_pages=total_pages
    )
    return FeatureWithPagination(feature, tools, total, backend_total, enabled_state, pagination)


def _create_feature_record(session: Session, user_id: str, name: str) -> Feature:
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


def create_feature(session: Session, user_id: str, name: str) -> FeatureWithPagination:
    feature = _create_feature_record(session, user_id, name)
    return _build_feature_with_pagination(session, feature)


def update_feature(session: Session, feature_id: UUID, user_id: str, name: str) -> FeatureWithPagination:
    normalized = _normalize_name(name)
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Feature name is required")
    feature = _get_feature(session, feature_id, user_id, load_tools=False)
    existing = _find_feature_by_name(session, user_id, normalized)
    if existing and existing.id != feature_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Feature name already exists")
    feature.name = normalized
    feature.updated_at = func.now()
    session.flush()
    log_info("FeatureService", "update_feature", "Feature renamed", user_id=user_id, feature_id=str(feature_id))
    return _build_feature_with_pagination(session, feature)


def delete_feature(session: Session, feature_id: UUID, user_id: str) -> None:
    feature = _get_feature(session, feature_id, user_id, load_tools=True)
    tool_count = len(feature.tools)
    for tool in list(feature.tools):
        delete_tool_embedding(session, tool.id)
    session.delete(feature)
    session.flush()
    if tool_count:
        adjust_tool_count(session, user_id, -tool_count)
    log_info("FeatureService", "delete_feature", "Feature deleted", user_id=user_id, feature_id=str(feature_id))


def set_feature_enabled(session: Session, feature_id: UUID, user_id: str, enabled: bool) -> FeatureWithPagination:
    feature = _get_feature(session, feature_id, user_id, load_tools=True)
    changes = 0
    for tool in feature.tools:
        if tool.agent_enabled == enabled:
            continue
        tool.agent_enabled = enabled
        tool.updated_at = func.now()
        changes += 1
        if enabled:
            enqueue_tool_embedding(tool.id, user_id)
        else:
            delete_tool_embedding(session, tool.id)
    if changes:
        feature.updated_at = func.now()
        session.flush()
    log_info("FeatureService", "set_feature_enabled", "Feature toggled", user_id=user_id, feature_id=str(feature_id), enabled=enabled)
    return _build_feature_with_pagination(session, feature)


def resolve_feature(session: Session, user_id: str, selector: FeatureSelector, tool_payload: ToolPayload) -> Feature:
    if selector.mode == "existing":
        return _get_feature(session, selector.id, user_id)
    if selector.mode == "new":
        return _create_feature_record(session, user_id, selector.name or "")
    current = list(session.scalars(select(Feature).where(Feature.user_id == user_id)).all())
    feature_name = classify_feature_name(tool_payload.model_dump(mode="json"), [item.name for item in current])
    match = next((item for item in current if item.name.lower() == feature_name.lower()), None)
    if match:
        return match
    return _create_feature_record(session, user_id, feature_name)


def delete_feature_if_empty(session: Session, feature_id: UUID, user_id: str) -> None:
    feature = _get_feature(session, feature_id, user_id, load_tools=True)
    if feature.tools:
        return None
    session.delete(feature)
    session.flush()
    log_info("FeatureService", "delete_feature_if_empty", "Deleted empty feature", user_id=user_id, feature_id=str(feature_id))
