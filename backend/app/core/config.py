from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="chat-to-api")
    debug: bool = Field(default=False)
    database_url: str = Field(
        default="postgresql+psycopg2://postgres:postgres@localhost:5432/chat_to_api"
    )
    redis_url: str = Field(default="redis://localhost:6379/0")
    hcaptcha_secret: str = Field(default="")
    clerk_secret_key: str = Field(default="")


@lru_cache
def get_settings() -> Settings:
    return Settings()
