import os

from app.core.config import Settings, get_settings


def test_settings_overrides_env(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("APP_NAME", "custom-app")
    monkeypatch.setenv("DEBUG", "true")
    settings = Settings()
    assert settings.app_name == "custom-app"
    assert settings.debug is True


def test_get_settings_cached(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.delenv("APP_NAME", raising=False)
    cached = get_settings()
    same = get_settings()
    assert cached is same

