from pydantic import BaseModel


class WidgetTokenResponse(BaseModel):
    token: str

