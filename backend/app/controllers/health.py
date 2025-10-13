from fastapi import APIRouter

from ..schemas.health import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def read_health() -> HealthResponse:
    return HealthResponse(status="healthy")
