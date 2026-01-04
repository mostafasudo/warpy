from contextlib import asynccontextmanager

from fastapi import FastAPI

from .controllers.agent import router as agent_router
from .controllers.billing import router as billing_router
from .controllers.config import router as config_router
from .controllers.features import router as features_router
from .controllers.endpoints import router as endpoints_router
from .controllers.health import router as health_router
from .controllers.lemon_squeezy_webhook import router as lemon_squeezy_webhook_router
from .controllers.products import router as products_router
from .controllers.session import router as session_router
from .controllers.widget import router as widget_router
from .controllers.widget_token import router as widget_token_router
from .core.config import get_settings
from .core.cors import configure_cors


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)
    configure_cors(app, settings)
    app.include_router(health_router)
    app.include_router(session_router)
    app.include_router(config_router)
    app.include_router(features_router)
    app.include_router(endpoints_router)
    app.include_router(agent_router)
    app.include_router(billing_router)
    app.include_router(widget_router)
    app.include_router(widget_token_router)
    app.include_router(products_router)
    app.include_router(lemon_squeezy_webhook_router)

    return app


app = create_app()
