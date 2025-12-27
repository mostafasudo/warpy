from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import Agent
from ..schemas.agent import AgentWidgetInstallResponse, AgentWidgetInstallUpdate


def get_agent_widget_install(session: Session, user_id: str) -> AgentWidgetInstallResponse:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return AgentWidgetInstallResponse(
        framework=agent.widget_install_framework,
        package_manager=agent.widget_install_package_manager,
    )


def update_agent_widget_install(
    session: Session,
    user_id: str,
    payload: AgentWidgetInstallUpdate,
) -> AgentWidgetInstallResponse:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id).with_for_update())
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent.widget_install_framework = payload.framework
    agent.widget_install_package_manager = payload.package_manager

    session.flush()
    log_info("AgentWidgetInstallService", "update", "Widget install preferences updated", user_id=user_id)
    return AgentWidgetInstallResponse(
        framework=agent.widget_install_framework,
        package_manager=agent.widget_install_package_manager,
    )
