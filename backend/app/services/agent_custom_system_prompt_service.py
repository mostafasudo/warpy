from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.agent_custom_system_prompt import normalize_custom_user_system_prompt
from ..core.logger import log_info
from ..models import Agent
from ..schemas.agent import CustomUserSystemPromptResponse, CustomUserSystemPromptUpdate


def get_custom_user_system_prompt(
    session: Session,
    user_id: str,
) -> CustomUserSystemPromptResponse:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return CustomUserSystemPromptResponse(custom_user_system_prompt=agent.custom_user_system_prompt)


def update_custom_user_system_prompt(
    session: Session,
    user_id: str,
    payload: CustomUserSystemPromptUpdate,
) -> CustomUserSystemPromptResponse:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id).with_for_update())
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent.custom_user_system_prompt = normalize_custom_user_system_prompt(payload.custom_user_system_prompt)

    session.flush()
    log_info("AgentCustomSystemPromptService", "update", "Custom instructions updated", user_id=user_id)
    return CustomUserSystemPromptResponse(custom_user_system_prompt=agent.custom_user_system_prompt)
