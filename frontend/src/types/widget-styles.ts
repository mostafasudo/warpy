export type WidgetStylesColors = {
  primary: string
  background: string
  surface: string
  text: string
  textMuted: string
  border: string
}

export type WidgetStylesSpacing = {
  containerPadding: number
  messagePadding: number
  inputPadding: number
  messageGap: number
  sectionGap: number
}

export type WidgetStylesBorders = {
  containerWidth: number
  containerRadius: number
  messageWidth: number
  messageRadius: number
  buttonWidth: number
  buttonRadius: number
  inputWidth: number
  inputRadius: number
}

export type WidgetStylesTypography = {
  fontFamily: string
  fontSizeBase: number
  fontSizeSmall: number
  fontSizeLarge: number
  fontWeightNormal: number
  fontWeightMedium: number
  fontWeightBold: number
  lineHeight: number
}

export type WidgetStylesShadows = {
  widget: string
  message: string
  button: string
}

export type WidgetStyles = {
  version: string
  colors: WidgetStylesColors
  spacing: WidgetStylesSpacing
  borders: WidgetStylesBorders
  typography: WidgetStylesTypography
  shadows: WidgetStylesShadows
}

export const widgetStylesDefault: WidgetStyles = {
  version: "1.0",
  colors: {
    primary: "#0066FF",
    background: "#FFFFFF",
    surface: "#F5F5F5",
    text: "#111827",
    textMuted: "#6B7280",
    border: "#E5E7EB"
  },
  spacing: {
    containerPadding: 16,
    messagePadding: 12,
    inputPadding: 12,
    messageGap: 8,
    sectionGap: 16
  },
  borders: {
    containerWidth: 1,
    containerRadius: 16,
    messageWidth: 1,
    messageRadius: 12,
    buttonWidth: 1,
    buttonRadius: 8,
    inputWidth: 1,
    inputRadius: 8
  },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSizeBase: 14,
    fontSizeSmall: 12,
    fontSizeLarge: 16,
    fontWeightNormal: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
    lineHeight: 1.5
  },
  shadows: {
    widget: "0 4px 12px rgba(0,0,0,0.1)",
    message: "none",
    button: "0 1px 2px rgba(0,0,0,0.05)"
  }
}

export const mergeWidgetStyles = (styles?: Partial<WidgetStyles> | null): WidgetStyles => {
  if (!styles) return widgetStylesDefault
  return {
    version: styles.version ?? widgetStylesDefault.version,
    colors: { ...widgetStylesDefault.colors, ...(styles.colors ?? {}) },
    spacing: { ...widgetStylesDefault.spacing, ...(styles.spacing ?? {}) },
    borders: { ...widgetStylesDefault.borders, ...(styles.borders ?? {}) },
    typography: { ...widgetStylesDefault.typography, ...(styles.typography ?? {}) },
    shadows: { ...widgetStylesDefault.shadows, ...(styles.shadows ?? {}) }
  }
}

export const isWidgetStyles = (value: unknown): value is WidgetStyles => {
  if (!value || typeof value !== "object") return false
  const obj = value as WidgetStyles
  return (
    typeof obj.version === "string" &&
    typeof obj.colors === "object" &&
    typeof obj.spacing === "object" &&
    typeof obj.borders === "object" &&
    typeof obj.typography === "object" &&
    typeof obj.shadows === "object"
  )
}

export const validateWidgetStyles = (value: unknown): WidgetStyles | null => {
  if (!isWidgetStyles(value)) return null
  return mergeWidgetStyles(value)
}
