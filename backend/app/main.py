from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .controllers.health import router as health_router
from .core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, debug=settings.debug)
    
    # Configure CORS - allow all origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins
        allow_credentials=False,  # Must be False when allow_origins=["*"]
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    app.include_router(health_router)
    return app


app = create_app()
