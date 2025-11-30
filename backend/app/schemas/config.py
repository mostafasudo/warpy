from pydantic import BaseModel

from ..models import StorageSource


class SessionHeaderPayload(BaseModel):
    source: StorageSource
    key: str


class ConfigPayload(BaseModel):
    baseUrl: dict[str, str] = {}
    headers: dict[str, SessionHeaderPayload]


class ConfigResponse(ConfigPayload):
    pass
