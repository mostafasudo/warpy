import os
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="warpy")
    environment: str = Field(default="local")
    debug: bool = Field(default=False)
    database_url: str = Field(
        default="postgresql+psycopg2://postgres:postgres@localhost:5432/warpy"
    )
    redis_url: str = Field(default="redis://localhost:6379/0")
    clerk_secret_key: str = Field(default="")
    openai_api_key: str = Field(default="")
    aws_access_key: str = Field(default="")
    aws_secret_key: str = Field(default="")
    aws_region: str = Field(default="")
    langsmith_tracing: bool = Field(default=False)
    langsmith_endpoint: str = Field(default="")
    langsmith_api_key: str = Field(default="")
    langsmith_project: str = Field(default="")
    widget_jwt_secret: str = Field(default="")
    test_widget_token_api_key: str = Field(default="")
    lemon_squeezy_api_key: str = Field(default="")
    lemon_squeezy_store_id: str = Field(default="")
    lemon_squeezy_webhook_secret: str = Field(default="")
    lemon_squeezy_basic_variant_id: str = Field(default="")
    lemon_squeezy_pro_variant_id: str = Field(default="")
    lemon_squeezy_enterprise_variant_id: str = Field(default="")
    lemon_squeezy_topup_1000_variant_id: str = Field(default="")
    lemon_squeezy_topup_5000_variant_id: str = Field(default="")
    lemon_squeezy_topup_10000_variant_id: str = Field(default="")
    lemon_squeezy_redirect_url: str = Field(default="")
    lemon_squeezy_test_mode: bool = Field(default=False)
    billing_admin_token: str = Field(default="")


@lru_cache
def get_settings() -> Settings:
    env_file = None if os.getenv("PYTEST_CURRENT_TEST") else ".env"
    return Settings(_env_file=env_file)
