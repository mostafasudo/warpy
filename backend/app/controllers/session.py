from fastapi import APIRouter, Depends

from ..core.auth import require_clerk_session
from ..schemas.auth import ClerkSession, CurrentUserResponse

router = APIRouter()


@router.get("/me", response_model=CurrentUserResponse)
async def read_current_user(session: ClerkSession = Depends(require_clerk_session)) -> CurrentUserResponse:
    return CurrentUserResponse(session_id=session.id, user_id=session.user_id, status=session.status)
