from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..core.agent_custom_system_prompt import DEFAULT_CUSTOM_USER_SYSTEM_PROMPT
from ..core.logger import log_info
from ..models import Agent
from .billing_service import get_or_create_billing_account


def _insert_factory(session: Session):
    dialect = getattr(getattr(session, "bind", None), "dialect", None)
    if dialect and dialect.name == "postgresql":
        return pg_insert
    return sqlite_insert


def _insert_agent_if_missing(session: Session, user_id: str) -> bool:
    get_or_create_billing_account(session, user_id)
    insert_fn = _insert_factory(session)
    result = session.execute(
        insert_fn(Agent)
        .values(user_id=user_id)
        .on_conflict_do_nothing(index_elements=[Agent.user_id])
    )
    session.flush()
    return bool(result.rowcount)


def create_agent(session: Session, user_id: str) -> Agent:
    existing = session.scalar(select(Agent).where(Agent.user_id == user_id))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent already exists")
    created = _insert_agent_if_missing(session, user_id)
    if not created:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent already exists")
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id))
    if agent is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create agent")
    log_info("AgentService", "create_agent", "Agent created", user_id=user_id)
    return agent


def get_agent(session: Session, user_id: str) -> Agent | None:
    return session.scalar(select(Agent).where(Agent.user_id == user_id))


def get_or_create_agent(session: Session, user_id: str) -> Agent:
    existing = get_agent(session, user_id)
    if existing is not None:
        return existing

    created = _insert_agent_if_missing(session, user_id)
    agent = get_agent(session, user_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create agent")
    if created:
        log_info("AgentService", "get_or_create_agent", "Agent created", user_id=user_id)
    return agent


def build_agent_executor_config(agent: Agent | None) -> dict[str, bool | str]:
    if not agent:
        return {
            "frontend_capability_enabled": True,
            "knowledge_base_enabled": True,
            "widget_suggestions_enabled": False,
            "custom_user_system_prompt": DEFAULT_CUSTOM_USER_SYSTEM_PROMPT,
        }

    return {
        "frontend_capability_enabled": (
            agent.frontend_capability_enabled
            if agent.frontend_capability_enabled is not None
            else True
        ),
        "knowledge_base_enabled": (
            agent.knowledge_base_enabled
            if agent.knowledge_base_enabled is not None
            else True
        ),
        "widget_suggestions_enabled": (
            agent.widget_suggestions_enabled
            if agent.widget_suggestions_enabled is not None
            else False
        ),
        "custom_user_system_prompt": (
            agent.custom_user_system_prompt
            if agent.custom_user_system_prompt is not None
            else DEFAULT_CUSTOM_USER_SYSTEM_PROMPT
        ),
    }
def update_frontend_capability(
    session: Session,
    user_id: str,
    enabled: bool,
) -> Agent:
    agent = get_agent(session, user_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent.frontend_capability_enabled = enabled
    session.commit()
    session.refresh(agent)
    log_info("AgentService", "update_frontend_capability", "Frontend capability updated", user_id=user_id)
    return agent


def update_user_rate_limits(
    session: Session,
    user_id: str,
    enabled: bool,
    daily_limit: int | None,
    monthly_limit: int | None,
) -> Agent:
    agent = get_agent(session, user_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    
    agent.user_rate_limit_enabled = enabled
    agent.user_rate_limit_daily = daily_limit
    agent.user_rate_limit_monthly = monthly_limit
    session.commit()
    session.refresh(agent)
    log_info("AgentService", "update_user_rate_limits", "User rate limits updated", user_id=user_id)
    return agent
