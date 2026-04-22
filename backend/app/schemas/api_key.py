from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ApiKeySummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    api_key_last4: str = Field(alias="apiKeyLast4")
    created_at: datetime = Field(alias="createdAt")
    rotated_at: datetime | None = Field(default=None, alias="rotatedAt")


class ApiKeyRevealResponse(ApiKeySummaryResponse):
    api_key: str = Field(alias="apiKey")
