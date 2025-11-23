from pydantic import BaseModel, ConfigDict, Field

from ..models import StorageSource


class SessionHeaderPayload(BaseModel):
    source: StorageSource
    key: str


class ConfigPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    base_url: dict[str, str] = Field(alias="baseUrl")
    headers: dict[str, SessionHeaderPayload]


class ConfigResponse(ConfigPayload):
    pass
