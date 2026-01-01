import os

from app.core.config import Settings, get_settings


def test_settings_overrides_env(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("APP_NAME", "custom-app")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("AWS_ACCESS_KEY", "test-access-key")
    monkeypatch.setenv("AWS_SECRET_KEY", "test-secret-key")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    settings = Settings()
    assert settings.app_name == "custom-app"
    assert settings.debug is True
    assert settings.aws_access_key == "test-access-key"
    assert settings.aws_secret_key == "test-secret-key"
    assert settings.aws_region == "us-east-1"


def test_get_settings_cached(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.delenv("APP_NAME", raising=False)
    cached = get_settings()
    same = get_settings()
    assert cached is same
