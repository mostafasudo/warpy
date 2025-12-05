from pydantic import BaseModel, ConfigDict, Field

from ..models import AuthType, StorageSource


class SessionHeaderPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source: StorageSource
    key: str
    auth_type: AuthType | None = Field(default=None, alias="authType")


class ConfigPayload(BaseModel):
    baseUrl: dict[str, str] = {}
    headers: dict[str, SessionHeaderPayload]


class ConfigResponse(ConfigPayload):
    pass
