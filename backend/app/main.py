from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .controllers.config import router as config_router
from .controllers.endpoints import router as endpoints_router
from .controllers.health import router as health_router
from .controllers.session import router as session_router
from .core.config import get_settings
from .core.database import session_scope
from .core.logger import log_error
from .services.config_service import ensure_required_environments


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        with session_scope() as session:
            ensure_required_environments(session)
    except Exception as exc:
        log_error("Main", "lifespan_start", "Failed to bootstrap application", exc=exc)
        raise
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)
    
    # Configure CORS - allow all origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins
        allow_credentials=False,  # Must be False when allow_origins=["*"]
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    app.include_router(health_router)
    app.include_router(session_router)
    app.include_router(config_router)
    app.include_router(endpoints_router)

    return app


app = create_app()
