import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


COLOR_PATTERN = re.compile(
    r"^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|"
    r"rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|"
    r"rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(0|1|0?\.\d+)\s*\))$"
)

def validate_color(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Color value must be a non-empty string")
    if not COLOR_PATTERN.match(value.strip()):
        raise ValueError("Invalid color format")
    return value.strip()


def validate_shadow(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Shadow value must be a non-empty string")
    return value.strip()


class ColorsSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    primary: str = "#0066FF"
    background: str = "#FFFFFF"
    surface: str = "#F5F5F5"
    text: str = "#111827"
    text_muted: str = Field(default="#6B7280", alias="textMuted")
    border: str = "#E5E7EB"

    _validate_primary = field_validator("primary")(validate_color)
    _validate_background = field_validator("background")(validate_color)
    _validate_surface = field_validator("surface")(validate_color)
    _validate_text = field_validator("text")(validate_color)
    _validate_text_muted = field_validator("text_muted")(validate_color)
    _validate_border = field_validator("border")(validate_color)


class SpacingSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    container_padding: int = Field(default=16, alias="containerPadding", ge=0)
    message_padding: int = Field(default=12, alias="messagePadding", ge=0)
    input_padding: int = Field(default=12, alias="inputPadding", ge=0)
    message_gap: int = Field(default=8, alias="messageGap", ge=0)
    section_gap: int = Field(default=16, alias="sectionGap", ge=0)


class BordersSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    container_width: int = Field(default=1, alias="containerWidth", ge=0)
    container_radius: int = Field(default=16, alias="containerRadius", ge=0)
    message_width: int = Field(default=1, alias="messageWidth", ge=0)
    message_radius: int = Field(default=12, alias="messageRadius", ge=0)
    button_width: int = Field(default=1, alias="buttonWidth", ge=0)
    button_radius: int = Field(default=8, alias="buttonRadius", ge=0)
    input_width: int = Field(default=1, alias="inputWidth", ge=0)
    input_radius: int = Field(default=8, alias="inputRadius", ge=0)


class TypographySchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    font_family: str = Field(default="Inter, system-ui, sans-serif", alias="fontFamily")
    font_size_base: int = Field(default=14, alias="fontSizeBase", ge=8)
    font_size_small: int = Field(default=12, alias="fontSizeSmall", ge=8)
    font_size_large: int = Field(default=16, alias="fontSizeLarge", ge=8)
    font_weight_normal: int = Field(default=400, alias="fontWeightNormal", ge=100, le=900)
    font_weight_medium: int = Field(default=500, alias="fontWeightMedium", ge=100, le=900)
    font_weight_bold: int = Field(default=600, alias="fontWeightBold", ge=100, le=900)
    line_height: float = Field(default=1.5, alias="lineHeight", ge=1.0, le=2.0)


class ShadowsSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    widget: str = "0 4px 12px rgba(0,0,0,0.1)"
    message: str = "none"
    button: str = "0 1px 2px rgba(0,0,0,0.05)"

    _validate_widget = field_validator("widget")(validate_shadow)
    _validate_message = field_validator("message")(validate_shadow)
    _validate_button = field_validator("button")(validate_shadow)


class WidgetStyles(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    version: str = "1.0"
    colors: ColorsSchema = Field(default_factory=ColorsSchema)
    spacing: SpacingSchema = Field(default_factory=SpacingSchema)
    borders: BordersSchema = Field(default_factory=BordersSchema)
    typography: TypographySchema = Field(default_factory=TypographySchema)
    shadows: ShadowsSchema = Field(default_factory=ShadowsSchema)

    @model_validator(mode="after")
    def validate_version(self):
        if not isinstance(self.version, str) or not self.version.strip():
            raise ValueError("Version is required")
        return self


def get_default_widget_styles() -> WidgetStyles:
    return WidgetStyles()
