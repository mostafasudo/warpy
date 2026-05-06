from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import WidgetUiComponent
from ..schemas.widget_dynamic_ui import WidgetUiComponentPayload

BUILT_IN_WARPY_COMPONENT_KEYS = {
    "summary_card",
    "notice",
    "metric_strip",
    "key_value_list",
    "record_card",
    "compact_table",
    "timeline",
    "status_list",
    "source_list",
}


def list_widget_ui_components(session: Session, user_id: str, *, active_only: bool = False) -> list[WidgetUiComponent]:
    query = (
        select(WidgetUiComponent)
        .where(WidgetUiComponent.user_id == user_id)
        .order_by(WidgetUiComponent.component_key, WidgetUiComponent.version)
    )
    if active_only:
        query = query.where(WidgetUiComponent.active.is_(True))
    return list(session.scalars(query).all())


def get_widget_ui_component(session: Session, component_id: UUID, user_id: str) -> WidgetUiComponent:
    component = session.scalar(
        select(WidgetUiComponent).where(
            and_(WidgetUiComponent.id == component_id, WidgetUiComponent.user_id == user_id)
        )
    )
    if not component:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Widget component not found")
    return component


def create_widget_ui_component(session: Session, user_id: str, payload: WidgetUiComponentPayload) -> WidgetUiComponent:
    _validate_component_key(payload.key)
    component = WidgetUiComponent(
        user_id=user_id,
        component_key=payload.key,
        version=payload.version,
        display_name=payload.display_name,
        description=payload.description,
        framework=payload.framework,
        props_schema=payload.props_schema,
        suitability=payload.suitability,
        constraints=payload.constraints,
        active=payload.active,
    )
    session.add(component)
    try:
        session.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A widget component with this key and version already exists.",
        ) from exc
    return component


def update_widget_ui_component(
    session: Session,
    component_id: UUID,
    user_id: str,
    payload: WidgetUiComponentPayload,
) -> WidgetUiComponent:
    _validate_component_key(payload.key)
    component = get_widget_ui_component(session, component_id, user_id)
    component.component_key = payload.key
    component.version = payload.version
    component.display_name = payload.display_name
    component.description = payload.description
    component.framework = payload.framework
    component.props_schema = payload.props_schema
    component.suitability = payload.suitability
    component.constraints = payload.constraints
    component.active = payload.active
    try:
        session.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A widget component with this key and version already exists.",
        ) from exc
    return component


def delete_widget_ui_component(session: Session, component_id: UUID, user_id: str) -> None:
    component = get_widget_ui_component(session, component_id, user_id)
    session.delete(component)
    session.flush()


def _validate_component_key(key: str) -> None:
    if key in BUILT_IN_WARPY_COMPONENT_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Native component keys cannot reuse built-in Warpy component names.",
        )
