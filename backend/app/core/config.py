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
    langsmith_tracing: bool = Field(default=False)
    langsmith_endpoint: str = Field(default="")
    langsmith_api_key: str = Field(default="")
    langsmith_project: str = Field(default="")
    widget_jwt_secret: str = Field(default="")
    test_widget_token_api_key: str = Field(default="")


@lru_cache
def get_settings() -> Settings:
    return Settings()
