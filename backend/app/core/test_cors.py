from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings
from app.core.cors import configure_cors


class DummyApp:
    def __init__(self):
        self.calls = []

    def add_middleware(self, middleware, **kwargs):
        self.calls.append((middleware, kwargs))


def test_configure_cors_adds_middleware():
    app = DummyApp()
    settings = Settings()
    configure_cors(app, settings)
    middleware, kwargs = app.calls[0]
    assert middleware is CORSMiddleware
    assert kwargs["allow_origins"] == ["*"]
    assert kwargs["allow_methods"] == ["*"]
    assert kwargs["allow_headers"] == ["*"]
    assert kwargs["allow_credentials"] is False
