from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..models import AuthType, StorageSource


class SessionHeaderPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, exclude_none=True)

    source: StorageSource
    key: str = ""
    auth_type: AuthType | None = Field(default=None, alias="authType")


class AuthConfigPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, exclude_none=True)

    mode: Literal["none", "header"] = "none"
    source: StorageSource | None = None
    key: str | None = None
    auth_type: AuthType | None = Field(default=None, alias="authType")

    @model_validator(mode="after")
    def validate_mode(self):
        if self.mode == "none":
            object.__setattr__(self, "source", None)
            object.__setattr__(self, "key", None)
            object.__setattr__(self, "auth_type", None)
            return self
        if self.source not in (StorageSource.local_storage, StorageSource.session_storage, StorageSource.cookies):
            raise ValueError("Header auth must use localStorage, sessionStorage, or cookies")
        trimmed_key = self.key.strip() if isinstance(self.key, str) else ""
        if not trimmed_key:
            raise ValueError("Header auth key is required")
        object.__setattr__(self, "key", trimmed_key)
        object.__setattr__(self, "auth_type", self.auth_type or AuthType.bearer)
        return self


class ConfigPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, exclude_none=True)

    baseUrl: dict[str, str] = {}
    auth: AuthConfigPayload = Field(default_factory=AuthConfigPayload)
    send_cookies_with_requests: bool = Field(default=False, alias="sendCookiesWithRequests")
    headers: dict[str, SessionHeaderPayload]


class ConfigResponse(ConfigPayload):
    model_config = ConfigDict(populate_by_name=True, exclude_none=True)
