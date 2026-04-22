from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.auth import require_dashboard_principal
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.agent import AgentResponse
from ..schemas.auth import DashboardPrincipal
from ..schemas.knowledge_base import KnowledgeWebsiteCreate, KnowledgeWebsiteResponse
from ..schemas.onboarding import OnboardingStateResponse
from ..services.onboarding_service import add_onboarding_website, finalize_onboarding, get_onboarding_state, start_onboarding
from ..workers.knowledge_base_jobs import enqueue_website_processing

router = APIRouter()


def _should_enqueue_onboarding_website(website: dict, created: bool) -> bool:
    if created:
        return True
    return (
        website.get("status") == "processing"
        and website.get("pageCount") == 0
        and website.get("lastCrawledAt") is None
    )


@router.get("/onboarding/state", response_model=OnboardingStateResponse)
def read_onboarding_state(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> OnboardingStateResponse:
    try:
        return get_onboarding_state(session, principal.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("OnboardingController", "read_state", "Failed to fetch onboarding state", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch onboarding state")


@router.post("/onboarding/start", response_model=OnboardingStateResponse)
def begin_onboarding(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> OnboardingStateResponse:
    try:
        state = start_onboarding(session, principal.user_id)
        log_info("OnboardingController", "begin_onboarding", "Onboarding started", user_id=principal.user_id, status=state.status)
        return state
    except HTTPException:
        raise
    except Exception as error:
        log_error("OnboardingController", "begin_onboarding", "Failed to start onboarding", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to start onboarding")


@router.post("/onboarding/website", response_model=KnowledgeWebsiteResponse, status_code=status.HTTP_201_CREATED)
def create_onboarding_website(
    payload: KnowledgeWebsiteCreate,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> KnowledgeWebsiteResponse:
    try:
        try:
            result = add_onboarding_website(session, principal.user_id, payload.url)
            session.commit()
        except IntegrityError:
            session.rollback()
            result = add_onboarding_website(session, principal.user_id, payload.url)
            session.commit()
        if _should_enqueue_onboarding_website(result.website, result.created):
            enqueue_website_processing(result.website["id"], principal.user_id)
        log_info(
            "OnboardingController",
            "create_onboarding_website",
            "Onboarding website added",
            user_id=principal.user_id,
            website_id=str(result.website["id"]),
            created=result.created,
        )
        return KnowledgeWebsiteResponse.model_validate(result.website)
    except HTTPException:
        raise
    except Exception as error:
        log_error("OnboardingController", "create_onboarding_website", "Failed to add onboarding website", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to add onboarding website")


@router.post("/onboarding/finalize", response_model=AgentResponse)
def complete_onboarding(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> AgentResponse:
    try:
        agent = finalize_onboarding(session, principal.user_id)
        log_info("OnboardingController", "complete_onboarding", "Onboarding finalized", user_id=principal.user_id, agent_id=str(agent.id))
        return agent
    except HTTPException:
        raise
    except Exception as error:
        log_error("OnboardingController", "complete_onboarding", "Failed to finalize onboarding", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to finalize onboarding")
