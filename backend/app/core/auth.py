from functools import lru_cache

import httpx
from clerk_backend_api import Clerk
from clerk_backend_api.security import authenticate_request
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .logger import log_error
from .database import get_session
from ..schemas.auth import ClerkSession, DashboardPrincipal
from ..services.api_key_service import get_user_api_key_by_secret, is_warpy_api_key

bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def _get_clerk_client() -> Clerk:
    settings = get_settings()
    return Clerk(bearer_auth=settings.clerk_secret_key)


def verify_clerk_session(token: str, forwarded_headers: dict[str, str] | None = None) -> ClerkSession:
    settings = get_settings()
    clerk = _get_clerk_client()
    
    headers = {"authorization": f"Bearer {token}"}
    if forwarded_headers:
        headers.update({k.lower(): v for k, v in forwarded_headers.items() if v})
    
    httpx_request = httpx.Request("GET", "https://example.com", headers=headers)
    
    try:
        request_state = clerk.authenticate_request(
            httpx_request,
            AuthenticateRequestOptions()
        )
        
        if not request_state.is_signed_in:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=request_state.reason or "Unauthorized"
            )
        
        payload = request_state.payload
        if not payload:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
        
        session_id = payload.get("sid")
        user_id = payload.get("sub")
        session_status = payload.get("sts")
        
        if not session_id or not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session claims")
        
        return ClerkSession(id=session_id, user_id=user_id, status=session_status)
    
    except HTTPException:
        raise
    except Exception as error:
        log_error("auth", "verify_clerk_session", "Clerk authentication failed", exc=error)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication failed")


async def require_clerk_session(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)
) -> ClerkSession:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    settings = get_settings()
    if not settings.clerk_secret_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Clerk secret key missing")
    forwarded = {
        "Origin": request.headers.get("origin", ""),
        "Referer": request.headers.get("referer", ""),
        "User-Agent": request.headers.get("user-agent", ""),
        "X-Forwarded-Host": request.headers.get("x-forwarded-host", ""),
        "X-Forwarded-Proto": request.headers.get("x-forwarded-proto", ""),
        "Sec-Fetch-Dest": request.headers.get("sec-fetch-dest", ""),
        "Accept": request.headers.get("accept", "application/json")
    }
    return verify_clerk_session(credentials.credentials, forwarded_headers=forwarded)


async def require_dashboard_principal(
    request: Request,
    session: Session = Depends(get_session),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> DashboardPrincipal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    token = credentials.credentials
    if is_warpy_api_key(token):
        api_key = get_user_api_key_by_secret(session, token)
        if api_key is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
        return DashboardPrincipal(
            id=f"api_key:{api_key.user_id}",
            user_id=api_key.user_id,
            status="active",
            auth_method="api_key",
        )

    clerk_session = await require_clerk_session(request, credentials)
    return DashboardPrincipal(
        id=clerk_session.id,
        user_id=clerk_session.user_id,
        status=clerk_session.status,
        auth_method="clerk",
    )
