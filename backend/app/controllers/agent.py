from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.auth import require_dashboard_principal
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.agent import (
    AgentResponse,
    AgentWidgetConfigResponse,
    AgentWidgetConfigUpdate,
    AgentWidgetInstallResponse,
    AgentWidgetInstallUpdate,
    CustomUserSystemPromptResponse,
    CustomUserSystemPromptUpdate,
    FrontendCapabilityResponse,
    FrontendCapabilityUpdate,
    UserRateLimitsResponse,
    UserRateLimitsUpdate,
    WidgetSecurityDraftUpdate,
    WidgetSecurityResponse,
)
from ..schemas.auth import DashboardPrincipal
from ..services.agent_service import (
    create_agent,
    get_agent,
    update_frontend_capability,
    update_user_rate_limits,
)
from ..services.agent_custom_system_prompt_service import (
    get_custom_user_system_prompt,
    update_custom_user_system_prompt,
)
from ..services.agent_widget_security_service import (
    deploy_widget_security_draft,
    discard_widget_security_draft,
    get_widget_security_state,
    update_widget_security_draft,
)
from ..services.agent_widget_config_service import (
    get_agent_widget_config,
    update_agent_widget_config,
)
from ..services.agent_widget_install_service import (
    get_agent_widget_install,
    update_agent_widget_install,
)

router = APIRouter()


@router.post("/agent", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_route(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> AgentResponse:
    try:
        agent = create_agent(session, principal.user_id)
        log_info("AgentController", "create_agent", "Agent created", user_id=principal.user_id)
        return AgentResponse.model_validate(agent)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "create_agent", "Failed to create agent", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create agent")


@router.get("/agent", response_model=AgentResponse)
async def get_agent_route(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> AgentResponse:
    try:
        agent = get_agent(session, principal.user_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        return AgentResponse.model_validate(agent)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "get_agent", "Failed to get agent", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get agent")


@router.get("/agent/widget-security", response_model=WidgetSecurityResponse)
async def get_widget_security_route(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> WidgetSecurityResponse:
    try:
        return get_widget_security_state(session, principal.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "get_widget_security", "Failed to fetch widget security", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch widget security")


@router.patch("/agent/widget-security/draft", response_model=WidgetSecurityResponse)
async def update_widget_security_draft_route(
    payload: WidgetSecurityDraftUpdate,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> WidgetSecurityResponse:
    try:
        require_set = "require_signed_widget_token" in payload.model_fields_set
        refresh_set = "widget_refresh_endpoint_path" in payload.model_fields_set
        return update_widget_security_draft(
            session,
            principal.user_id,
            require_signed_widget_token=payload.require_signed_widget_token if require_set and payload.require_signed_widget_token is not None else None,
            widget_refresh_endpoint_path=payload.widget_refresh_endpoint_path if refresh_set and payload.widget_refresh_endpoint_path is not None else None,
            clear_require_signed_widget_token=require_set and payload.require_signed_widget_token is None,
            clear_widget_refresh_endpoint_path=refresh_set and payload.widget_refresh_endpoint_path is None,
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "update_widget_security_draft", "Failed to update widget security draft", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update widget security draft")


@router.post("/agent/widget-security/deploy", response_model=WidgetSecurityResponse)
async def deploy_widget_security_route(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> WidgetSecurityResponse:
    try:
        return deploy_widget_security_draft(session, principal.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "deploy_widget_security", "Failed to deploy widget security draft", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to deploy widget security draft")


@router.post("/agent/widget-security/discard", response_model=WidgetSecurityResponse)
async def discard_widget_security_route(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> WidgetSecurityResponse:
    try:
        return discard_widget_security_draft(session, principal.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "discard_widget_security", "Failed to discard widget security draft", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to discard widget security draft")


@router.get("/agent/widget-config", response_model=AgentWidgetConfigResponse)
async def get_agent_widget_config_route(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> AgentWidgetConfigResponse:
    try:
        return get_agent_widget_config(session, principal.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "get_widget_config", "Failed to fetch widget config", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch widget config")


@router.put("/agent/widget-config", response_model=AgentWidgetConfigResponse)
async def update_agent_widget_config_route(
    payload: AgentWidgetConfigUpdate,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> AgentWidgetConfigResponse:
    try:
        return update_agent_widget_config(session, principal.user_id, payload)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "update_widget_config", "Failed to update widget config", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update widget config")


@router.get("/agent/widget-install", response_model=AgentWidgetInstallResponse)
async def get_agent_widget_install_route(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> AgentWidgetInstallResponse:
    try:
        return get_agent_widget_install(session, principal.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "get_widget_install", "Failed to fetch widget install preferences", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch widget install preferences")


@router.put("/agent/widget-install", response_model=AgentWidgetInstallResponse)
async def update_agent_widget_install_route(
    payload: AgentWidgetInstallUpdate,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> AgentWidgetInstallResponse:
    try:
        return update_agent_widget_install(session, principal.user_id, payload)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "update_widget_install", "Failed to update widget install preferences", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update widget install preferences")


@router.get("/agent/frontend-capability", response_model=FrontendCapabilityResponse)
async def get_frontend_capability_route(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> FrontendCapabilityResponse:
    try:
        agent = get_agent(session, principal.user_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        return FrontendCapabilityResponse(enabled=agent.frontend_capability_enabled)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "get_frontend_capability", "Failed to fetch frontend capability", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch frontend capability")


@router.get("/agent/custom-system-prompt", response_model=CustomUserSystemPromptResponse)
async def get_custom_system_prompt_route(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> CustomUserSystemPromptResponse:
    try:
        return get_custom_user_system_prompt(session, principal.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error(
            "AgentController",
            "get_custom_system_prompt",
            "Failed to fetch custom system prompt",
            exc=error,
            user_id=principal.user_id,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch custom system prompt")


@router.put("/agent/custom-system-prompt", response_model=CustomUserSystemPromptResponse)
async def update_custom_system_prompt_route(
    payload: CustomUserSystemPromptUpdate,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> CustomUserSystemPromptResponse:
    try:
        return update_custom_user_system_prompt(session, principal.user_id, payload)
    except HTTPException:
        raise
    except Exception as error:
        log_error(
            "AgentController",
            "update_custom_system_prompt",
            "Failed to update custom system prompt",
            exc=error,
            user_id=principal.user_id,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update custom system prompt")


@router.put("/agent/frontend-capability", response_model=FrontendCapabilityResponse)
async def update_frontend_capability_route(
    payload: FrontendCapabilityUpdate,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> FrontendCapabilityResponse:
    try:
        agent = update_frontend_capability(session, principal.user_id, payload.enabled)
        return FrontendCapabilityResponse(enabled=agent.frontend_capability_enabled)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "update_frontend_capability", "Failed to update frontend capability", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update frontend capability")


@router.get("/agent/user-rate-limits", response_model=UserRateLimitsResponse)
async def get_user_rate_limits_route(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> UserRateLimitsResponse:
    try:
        agent = get_agent(session, principal.user_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        return UserRateLimitsResponse(
            enabled=agent.user_rate_limit_enabled,
            daily_limit=agent.user_rate_limit_daily,
            monthly_limit=agent.user_rate_limit_monthly,
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "get_user_rate_limits", "Failed to fetch user rate limits", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch user rate limits")


@router.put("/agent/user-rate-limits", response_model=UserRateLimitsResponse)
async def update_user_rate_limits_route(
    payload: UserRateLimitsUpdate,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> UserRateLimitsResponse:
    try:
        agent = update_user_rate_limits(
            session,
            principal.user_id,
            payload.enabled,
            payload.daily_limit,
            payload.monthly_limit,
        )
        return UserRateLimitsResponse(
            enabled=agent.user_rate_limit_enabled,
            daily_limit=agent.user_rate_limit_daily,
            monthly_limit=agent.user_rate_limit_monthly,
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "update_user_rate_limits", "Failed to update user rate limits", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update user rate limits")
