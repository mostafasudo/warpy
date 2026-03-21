from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


OnboardingStatus = Literal["not_started", "in_progress", "completed", "not_applicable"]
OnboardingStep = Literal["website", "baseUrl", "auth", "agent"]


class OnboardingStateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: OnboardingStatus
    should_show: bool = Field(alias="shouldShow")
    next_step: OnboardingStep = Field(alias="nextStep")

