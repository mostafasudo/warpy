import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.database import get_session
from ..core.logger import log_error, log_info, log_warning
from ..models import Agent
from ..schemas.widget_token import WidgetTokenResponse
from ..services.widget_auth_service import hash_widget_api_key, mint_widget_jwt


router = APIRouter(tags=["widget-auth"])

bearer_scheme = HTTPBearer(auto_error=False)


@router.post("/widget-token", response_model=WidgetTokenResponse)
def mint_widget_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> WidgetTokenResponse:
    try:
        settings = get_settings()
        if not settings.widget_jwt_secret:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Widget JWT secret missing")
        if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

        api_key_hash = hash_widget_api_key(credentials.credentials)
        agent = session.scalar(select(Agent).where(Agent.widget_api_key_hash == api_key_hash))
        if not agent:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

        token = mint_widget_jwt(agent_id=agent.id, user_id=agent.user_id, secret=settings.widget_jwt_secret)
        log_info("WidgetTokenController", "mint_widget_token", "Widget token minted", agent_id=str(agent.id))
        return WidgetTokenResponse(token=token)
    except HTTPException:
        raise
    except Exception as error:
        log_error("WidgetTokenController", "mint_widget_token", "Failed to mint widget token", exc=error)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to mint widget token")


@router.post("/test-widget-token")
async def test_widget_token(request: Request) -> Response:
    settings = get_settings()
    if settings.environment.strip().lower() == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not available")
    if not settings.test_widget_token_api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="TEST_WIDGET_TOKEN_API_KEY missing")
    log_warning("WidgetTokenController", "test_widget_token", "Using test widget token endpoint")
    transport = httpx.ASGITransport(app=request.app)
    async with httpx.AsyncClient(transport=transport, base_url=str(request.base_url)) as client:
        response = await client.post(
            "/widget-token",
            headers={"Authorization": f"Bearer {settings.test_widget_token_api_key}"},
        )
    content_type = response.headers.get("content-type") or "application/json"
    return Response(content=response.content, status_code=response.status_code, media_type=content_type)
