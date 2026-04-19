from typing import Literal
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, model_validator

from ..services.knowledge_website_service import UnsafeWebsiteTargetError, ensure_public_website_url


McpAuthMode = Literal["none", "static_headers", "token_exchange"]


class McpConnectionPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=128)
    server_url: AnyHttpUrl = Field(alias="serverUrl")
    auth_mode: McpAuthMode = Field(alias="authMode")
    static_headers: dict[str, str] | None = Field(default=None, alias="staticHeaders")
    token_exchange_path: str | None = Field(default=None, alias="tokenExchangePath")

    @model_validator(mode="after")
    def validate_shape(self):
        try:
            ensure_public_website_url(str(self.server_url), error_message="Enter a public MCP server URL")
        except UnsafeWebsiteTargetError as exc:
            raise ValueError(str(exc)) from exc

        normalized_headers = {
            key.strip(): value.strip()
            for key, value in (self.static_headers or {}).items()
            if key.strip() and value.strip()
        }
        token_exchange_path = (self.token_exchange_path or "").strip() or None

        if self.auth_mode == "none":
            object.__setattr__(self, "static_headers", None)
            object.__setattr__(self, "token_exchange_path", None)
            return self

        if self.auth_mode == "static_headers":
            if not normalized_headers:
                raise ValueError("Static headers are required")
            object.__setattr__(self, "static_headers", normalized_headers)
            object.__setattr__(self, "token_exchange_path", None)
            return self

        if not token_exchange_path:
            raise ValueError("Token exchange path is required")
        if not token_exchange_path.startswith("/") or token_exchange_path.startswith("//"):
            raise ValueError("Token exchange path must be a same-origin path starting with /")
        object.__setattr__(self, "static_headers", None)
        object.__setattr__(self, "token_exchange_path", token_exchange_path)
        return self


class McpConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    name: str
    server_url: str = Field(alias="serverUrl")
    auth_mode: McpAuthMode = Field(alias="authMode")
    static_headers: dict[str, str] | None = Field(default=None, alias="staticHeaders")
    token_exchange_path: str | None = Field(default=None, alias="tokenExchangePath")


class WidgetMcpConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    name: str
    auth_mode: McpAuthMode = Field(alias="authMode")
    token_exchange_path: str | None = Field(default=None, alias="tokenExchangePath")


class McpAuthBundlePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    headers: dict[str, str]
    expires_at: str | None = Field(default=None, alias="expiresAt")
