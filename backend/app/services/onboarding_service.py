from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from ..models import Agent, Environment, Feature, KnowledgeDocument, KnowledgeWebsite, McpConnection, SessionHeader, UserOnboardingState
from ..schemas.agent import AgentResponse
from ..schemas.onboarding import OnboardingStateResponse
from .agent_service import get_agent, get_or_create_agent
from .billing_service import get_billing_actions_summary
from .knowledge_base_service import SOURCE_KIND_FILE
from .knowledge_website_service import (
    build_website_response,
    create_website_record,
    normalize_website_input,
    resolve_website_scope,
)


@dataclass(frozen=True)
class OnboardingWebsiteResult:
    website: dict
    created: bool


def _insert_factory(session: Session):
    dialect = getattr(getattr(session, "bind", None), "dialect", None)
    if dialect and dialect.name == "postgresql":
        return pg_insert
    return sqlite_insert


def _has_non_empty_base_url(session: Session, user_id: str) -> bool:
    return (
        session.scalar(
            select(Environment.id).where(
                Environment.user_id == user_id,
                func.length(func.trim(Environment.base_url)) > 0,
            ).limit(1)
        )
        is not None
    )


def _has_session_headers(session: Session, user_id: str) -> bool:
    return session.scalar(select(SessionHeader.id).where(SessionHeader.user_id == user_id).limit(1)) is not None


def _has_authorization_header(session: Session, user_id: str) -> bool:
    return (
        session.scalar(
            select(SessionHeader.id).where(
                SessionHeader.user_id == user_id,
                func.lower(SessionHeader.header_name) == "authorization",
            ).limit(1)
        )
        is not None
    )


def _has_mcp_connections(session: Session, user_id: str) -> bool:
    return session.scalar(select(McpConnection.id).where(McpConnection.user_id == user_id).limit(1)) is not None


def _has_features(session: Session, user_id: str) -> bool:
    return session.scalar(select(Feature.id).where(Feature.user_id == user_id).limit(1)) is not None


def _has_knowledge_sources(session: Session, user_id: str) -> bool:
    has_websites = session.scalar(select(KnowledgeWebsite.id).where(KnowledgeWebsite.user_id == user_id).limit(1)) is not None
    if has_websites:
        return True
    return (
        session.scalar(
            select(KnowledgeDocument.id).where(
                KnowledgeDocument.user_id == user_id,
                KnowledgeDocument.source_kind == SOURCE_KIND_FILE,
            ).limit(1)
        )
        is not None
    )


def _has_meaningful_setup(session: Session, user_id: str) -> bool:
    return any((
        get_agent(session, user_id) is not None,
        _has_non_empty_base_url(session, user_id),
        _has_session_headers(session, user_id),
        _has_mcp_connections(session, user_id),
        _has_features(session, user_id),
        _has_knowledge_sources(session, user_id),
    ))


def _get_next_step(session: Session, user_id: str) -> str:
    if not _has_knowledge_sources(session, user_id):
        return "website"
    if not _has_non_empty_base_url(session, user_id):
        return "baseUrl"
    if not (_has_authorization_header(session, user_id) or _has_mcp_connections(session, user_id)):
        return "auth"
    return "agent"


def get_onboarding_state(session: Session, user_id: str) -> OnboardingStateResponse:
    record = session.get(UserOnboardingState, user_id)
    next_step = _get_next_step(session, user_id)

    if record and record.completed_at is not None:
        return OnboardingStateResponse(status="completed", shouldShow=False, nextStep="agent")

    if record:
        return OnboardingStateResponse(status="in_progress", shouldShow=True, nextStep=next_step)

    if _has_meaningful_setup(session, user_id):
        return OnboardingStateResponse(status="not_applicable", shouldShow=False, nextStep=next_step)

    return OnboardingStateResponse(status="not_started", shouldShow=True, nextStep=next_step)


def _ensure_onboarding_record(session: Session, user_id: str) -> UserOnboardingState:
    record = session.get(UserOnboardingState, user_id)
    if record is not None:
        return record

    insert_fn = _insert_factory(session)
    session.execute(
        insert_fn(UserOnboardingState)
        .values(user_id=user_id, started_at=datetime.now(tz=UTC))
        .on_conflict_do_nothing(index_elements=[UserOnboardingState.user_id])
    )
    session.flush()
    record = session.get(UserOnboardingState, user_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Onboarding is not available")
    return record


def start_onboarding(session: Session, user_id: str) -> OnboardingStateResponse:
    state = get_onboarding_state(session, user_id)
    if state.status != "not_started":
        return state

    _ensure_onboarding_record(session, user_id)
    return get_onboarding_state(session, user_id)


def _require_active_onboarding(session: Session, user_id: str) -> UserOnboardingState:
    state = start_onboarding(session, user_id)
    if not state.should_show:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Onboarding is not available")

    record = session.get(UserOnboardingState, user_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Onboarding is not available")
    return record


def _can_bypass_first_website_gate(session: Session, user_id: str) -> bool:
    summary = get_billing_actions_summary(session, user_id)
    if summary.total_remaining > 0:
        return False
    return not _has_knowledge_sources(session, user_id)


def _find_existing_website_by_input_candidates(session: Session, user_id: str, raw_url: str) -> KnowledgeWebsite | None:
    stripped = raw_url.strip()
    if not stripped:
        return None
    normalized_input = normalize_website_input(raw_url)
    candidates = [stripped, normalized_input]
    return session.scalar(
        select(KnowledgeWebsite).where(
            KnowledgeWebsite.user_id == user_id,
            or_(
                KnowledgeWebsite.input_url.in_(candidates),
                KnowledgeWebsite.scope_url.in_(candidates),
            ),
        ).limit(1)
    )


def _enable_knowledge_base_for_onboarding(session: Session, user_id: str) -> None:
    agent = get_or_create_agent(session, user_id)
    if not agent.knowledge_base_enabled:
        agent.knowledge_base_enabled = True
        session.flush()


def add_onboarding_website(session: Session, user_id: str, raw_url: str) -> OnboardingWebsiteResult:
    _require_active_onboarding(session, user_id)

    summary = get_billing_actions_summary(session, user_id)
    if summary.plan.value == "free" and summary.total_remaining <= 0 and not _can_bypass_first_website_gate(session, user_id):
        existing_by_input = _find_existing_website_by_input_candidates(session, user_id, raw_url)
        if existing_by_input is not None:
            return OnboardingWebsiteResult(website=build_website_response(existing_by_input), created=False)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Upgrade your plan to add knowledge sources")

    scope_url = resolve_website_scope(raw_url)
    existing = session.scalar(
        select(KnowledgeWebsite).where(
            KnowledgeWebsite.user_id == user_id,
            KnowledgeWebsite.scope_url == scope_url,
        )
    )
    if existing:
        return OnboardingWebsiteResult(website=build_website_response(existing), created=False)

    website = create_website_record(session, user_id, raw_url, scope_url)
    _enable_knowledge_base_for_onboarding(session, user_id)
    session.flush()
    return OnboardingWebsiteResult(website=build_website_response(website), created=True)


def finalize_onboarding(session: Session, user_id: str) -> AgentResponse:
    record = session.get(UserOnboardingState, user_id)
    if record is None and not _has_meaningful_setup(session, user_id):
        record = _ensure_onboarding_record(session, user_id)

    if record is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Onboarding is not available")

    agent = get_or_create_agent(session, user_id)

    if record.completed_at is None:
        if record.started_at is None:
            record.started_at = datetime.now(tz=UTC)
        record.completed_at = datetime.now(tz=UTC)
        session.flush()

    return AgentResponse.model_validate(agent)
