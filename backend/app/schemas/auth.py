from pydantic import BaseModel, ConfigDict


class ClerkSession(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    user_id: str
    status: str | None = None


class DashboardPrincipal(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    user_id: str
    status: str | None = None
    auth_method: str


class CurrentUserResponse(BaseModel):
    session_id: str
    user_id: str
    status: str | None = None
