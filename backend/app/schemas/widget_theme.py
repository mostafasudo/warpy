import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


HEX_COLOR_PATTERN = re.compile(r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


class WidgetThemeBaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class WidgetThemeColors(WidgetThemeBaseModel):
    text: str
    muted_text: str
    background: str
    surface: str
    surface_strong: str
    border: str
    border_strong: str
    accent: str
    accent_contrast: str
    accent_soft: str
    focus_ring: str
    scrim: str
    launcher_background: str
    launcher_border: str
    launcher_icon: str
    header_icon: str
    header_icon_hover: str
    assistant_bubble: str
    assistant_text: str
    user_bubble: str
    user_text: str
    user_border: str
    input_background: str
    input_text: str
    input_placeholder: str
    input_border: str
    suggestion_background: str
    suggestion_text: str
    suggestion_border: str
    suggestion_hover_background: str
    activity_background: str
    activity_text: str
    activity_muted: str
    warning_background: str
    warning_text: str
    warning_border: str
    security_background: str
    security_text: str
    security_muted: str
    code_background: str

    @field_validator("*")
    @classmethod
    def validate_hex_color(cls, value: str) -> str:
        if not HEX_COLOR_PATTERN.fullmatch(value):
            raise ValueError("must be a hex color like #112233 or #11223344")
        return value.upper()


class WidgetThemeTypography(WidgetThemeBaseModel):
    font_family: str = Field(min_length=1, max_length=200)
    font_size: float = Field(ge=11, le=20)
    heading_size: float = Field(ge=12, le=24)
    line_height: float = Field(ge=1.1, le=2.2)
    letter_spacing: float = Field(ge=-1.5, le=3)
    font_weight: Literal[400, 500, 600, 700]


class WidgetThemeDimensions(WidgetThemeBaseModel):
    panel_width: int = Field(ge=320, le=560)
    launcher_size: int = Field(ge=40, le=64)
    launcher_radius: int = Field(ge=0, le=32)
    panel_radius: int = Field(ge=0, le=32)
    bubble_radius: int = Field(ge=0, le=24)
    control_radius: int = Field(ge=0, le=24)
    input_height: int = Field(ge=36, le=56)
    panel_padding: int = Field(ge=8, le=24)
    message_padding: int = Field(ge=8, le=20)


class WidgetThemeShadows(WidgetThemeBaseModel):
    panel_y: int = Field(ge=0, le=40)
    panel_blur: int = Field(ge=0, le=80)
    panel_spread: int = Field(ge=-20, le=40)
    panel_opacity: float = Field(ge=0, le=1)
    launcher_y: int = Field(ge=0, le=40)
    launcher_blur: int = Field(ge=0, le=80)
    launcher_spread: int = Field(ge=-20, le=40)
    launcher_opacity: float = Field(ge=0, le=1)


class WidgetThemeMode(WidgetThemeBaseModel):
    colors: WidgetThemeColors
    typography: WidgetThemeTypography
    dimensions: WidgetThemeDimensions
    shadows: WidgetThemeShadows


class WidgetTheme(WidgetThemeBaseModel):
    version: Literal[1]
    light: WidgetThemeMode
    dark: WidgetThemeMode
