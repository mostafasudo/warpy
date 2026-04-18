import type {
  WidgetTheme,
  WidgetThemeColors,
  WidgetThemeDimensions,
  WidgetThemeMode,
  WidgetThemeShadows,
  WidgetThemeTypography,
} from "@/types"

export type WidgetThemeVariant = "light" | "dark"

export type WidgetColorField = {
  key: keyof WidgetThemeColors
  label: string
}

export type WidgetRangeField<T extends keyof WidgetThemeTypography | keyof WidgetThemeDimensions | keyof WidgetThemeShadows> = {
  key: T
  label: string
  min: number
  max: number
  step: number
}

const LIGHT_THEME: WidgetThemeMode = {
  colors: {
    text: "#111827",
    mutedText: "#4B5563",
    background: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceStrong: "#F8FAFC",
    border: "#D1D5DB",
    borderStrong: "#9CA3AF",
    accent: "#2563EB",
    accentContrast: "#FFFFFF",
    accentSoft: "#DBEAFE",
    focusRing: "#93C5FD",
    scrim: "#00000038",
    launcherBackground: "#FFFFFF",
    launcherBorder: "#CBD5E1",
    launcherIcon: "#2563EB",
    headerIcon: "#4B5563",
    headerIconHover: "#111827",
    assistantBubble: "#F3F4F6",
    assistantText: "#111827",
    userBubble: "#E5E7EB",
    userText: "#111827",
    userBorder: "#D1D5DB",
    inputBackground: "#FFFFFF",
    inputText: "#111827",
    inputPlaceholder: "#6B7280",
    inputBorder: "#CBD5E1",
    suggestionBackground: "#F8FAFC",
    suggestionText: "#111827",
    suggestionBorder: "#CBD5E1",
    suggestionHoverBackground: "#DBEAFE",
    activityBackground: "#FFFFFF",
    activityText: "#111827",
    activityMuted: "#6B7280",
    warningBackground: "#EFF6FF",
    warningText: "#1D4ED8",
    warningBorder: "#BFDBFE",
    securityBackground: "#FFFFFF",
    securityText: "#111827",
    securityMuted: "#6B7280",
    codeBackground: "#F3F4F6",
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    headingSize: 16,
    lineHeight: 1.55,
    letterSpacing: 0,
    fontWeight: 500,
  },
  dimensions: {
    panelWidth: 440,
    launcherSize: 42,
    launcherRadius: 16,
    panelRadius: 18,
    bubbleRadius: 16,
    controlRadius: 12,
    inputHeight: 42,
    panelPadding: 14,
    messagePadding: 12,
  },
  shadows: {
    panelY: 24,
    panelBlur: 60,
    panelSpread: 0,
    panelOpacity: 0.2,
    launcherY: 18,
    launcherBlur: 60,
    launcherSpread: 0,
    launcherOpacity: 0.2,
  },
}

const DARK_THEME: WidgetThemeMode = {
  colors: {
    text: "#F8FAFC",
    mutedText: "#CBD5E1",
    background: "#090A0B",
    surface: "#121416",
    surfaceStrong: "#1B1E22",
    border: "#2D3748",
    borderStrong: "#3F4A5A",
    accent: "#3B82F6",
    accentContrast: "#FFFFFF",
    accentSoft: "#1D4ED833",
    focusRing: "#60A5FA66",
    scrim: "#0000008C",
    launcherBackground: "#121416",
    launcherBorder: "#2D3748",
    launcherIcon: "#93C5FD",
    headerIcon: "#CBD5E1",
    headerIconHover: "#FFFFFF",
    assistantBubble: "#1B1E22",
    assistantText: "#F8FAFC",
    userBubble: "#23262B",
    userText: "#F8FAFC",
    userBorder: "#3F4A5A",
    inputBackground: "#1B1E22",
    inputText: "#F8FAFC",
    inputPlaceholder: "#94A3B8",
    inputBorder: "#334155",
    suggestionBackground: "#1B1E22",
    suggestionText: "#F8FAFC",
    suggestionBorder: "#334155",
    suggestionHoverBackground: "#1D4ED84D",
    activityBackground: "#121416",
    activityText: "#F8FAFC",
    activityMuted: "#CBD5E1",
    warningBackground: "#1E293B",
    warningText: "#E2E8F0",
    warningBorder: "#334155",
    securityBackground: "#090A0B",
    securityText: "#F8FAFC",
    securityMuted: "#CBD5E1",
    codeBackground: "#0F172A",
  },
  typography: {
    ...LIGHT_THEME.typography,
  },
  dimensions: {
    ...LIGHT_THEME.dimensions,
  },
  shadows: {
    panelY: 24,
    panelBlur: 60,
    panelSpread: 0,
    panelOpacity: 0.62,
    launcherY: 18,
    launcherBlur: 60,
    launcherSpread: 0,
    launcherOpacity: 0.62,
  },
}

export const DEFAULT_WIDGET_THEME: WidgetTheme = {
  version: 1,
  light: LIGHT_THEME,
  dark: DARK_THEME,
}

export const WIDGET_THEME_COLOR_GROUPS: Array<{
  key: "surface" | "messages" | "status"
  label: string
  fields: WidgetColorField[]
}> = [
  {
    key: "surface",
    label: "Surface",
    fields: [
      { key: "background", label: "Panel background" },
      { key: "surface", label: "Panel surface" },
      { key: "surfaceStrong", label: "Surface strong" },
      { key: "border", label: "Border" },
      { key: "borderStrong", label: "Border strong" },
      { key: "text", label: "Primary text" },
      { key: "mutedText", label: "Muted text" },
      { key: "accent", label: "Accent" },
      { key: "accentContrast", label: "Accent text" },
      { key: "accentSoft", label: "Accent soft" },
      { key: "focusRing", label: "Focus ring" },
      { key: "scrim", label: "Scrim" },
      { key: "launcherBackground", label: "Launcher background" },
      { key: "launcherBorder", label: "Launcher border" },
      { key: "launcherIcon", label: "Launcher icon" },
      { key: "headerIcon", label: "Header icon" },
      { key: "headerIconHover", label: "Header icon hover" },
      { key: "inputBackground", label: "Input background" },
      { key: "inputText", label: "Input text" },
      { key: "inputPlaceholder", label: "Input placeholder" },
      { key: "inputBorder", label: "Input border" },
      { key: "suggestionBackground", label: "Suggestion background" },
      { key: "suggestionText", label: "Suggestion text" },
      { key: "suggestionBorder", label: "Suggestion border" },
      { key: "suggestionHoverBackground", label: "Suggestion hover" },
      { key: "codeBackground", label: "Code background" },
    ],
  },
  {
    key: "messages",
    label: "Messages",
    fields: [
      { key: "assistantBubble", label: "Assistant bubble" },
      { key: "assistantText", label: "Assistant text" },
      { key: "userBubble", label: "User bubble" },
      { key: "userText", label: "User text" },
      { key: "userBorder", label: "User border" },
    ],
  },
  {
    key: "status",
    label: "Status & Safety",
    fields: [
      { key: "activityBackground", label: "Autopilot background" },
      { key: "activityText", label: "Autopilot text" },
      { key: "activityMuted", label: "Autopilot muted text" },
      { key: "warningBackground", label: "Warning background" },
      { key: "warningText", label: "Warning text" },
      { key: "warningBorder", label: "Warning border" },
      { key: "securityBackground", label: "Security panel background" },
      { key: "securityText", label: "Security panel text" },
      { key: "securityMuted", label: "Security panel muted text" },
    ],
  },
]

export const WIDGET_THEME_TYPOGRAPHY_FIELDS: Array<WidgetRangeField<keyof WidgetThemeTypography>> = [
  { key: "fontSize", label: "Font size", min: 11, max: 20, step: 1 },
  { key: "headingSize", label: "Header size", min: 12, max: 24, step: 1 },
  { key: "lineHeight", label: "Line height", min: 1.1, max: 2.2, step: 0.05 },
  { key: "letterSpacing", label: "Letter spacing", min: -1.5, max: 3, step: 0.1 },
]

export const WIDGET_THEME_DIMENSION_FIELDS: Array<WidgetRangeField<keyof WidgetThemeDimensions>> = [
  { key: "panelWidth", label: "Panel width", min: 320, max: 560, step: 4 },
  { key: "launcherSize", label: "Launcher size", min: 40, max: 64, step: 1 },
  { key: "launcherRadius", label: "Launcher radius", min: 0, max: 32, step: 1 },
  { key: "panelRadius", label: "Panel radius", min: 0, max: 32, step: 1 },
  { key: "bubbleRadius", label: "Bubble radius", min: 0, max: 24, step: 1 },
  { key: "controlRadius", label: "Control radius", min: 0, max: 24, step: 1 },
  { key: "inputHeight", label: "Input height", min: 36, max: 56, step: 1 },
  { key: "panelPadding", label: "Panel padding", min: 8, max: 24, step: 1 },
  { key: "messagePadding", label: "Message padding", min: 8, max: 20, step: 1 },
]

export const WIDGET_THEME_SHADOW_FIELDS: Array<WidgetRangeField<keyof WidgetThemeShadows>> = [
  { key: "panelY", label: "Panel shadow Y", min: 0, max: 40, step: 1 },
  { key: "panelBlur", label: "Panel shadow blur", min: 0, max: 80, step: 1 },
  { key: "panelSpread", label: "Panel shadow spread", min: -20, max: 40, step: 1 },
  { key: "panelOpacity", label: "Panel shadow opacity", min: 0, max: 1, step: 0.05 },
  { key: "launcherY", label: "Launcher shadow Y", min: 0, max: 40, step: 1 },
  { key: "launcherBlur", label: "Launcher shadow blur", min: 0, max: 80, step: 1 },
  { key: "launcherSpread", label: "Launcher shadow spread", min: -20, max: 40, step: 1 },
  { key: "launcherOpacity", label: "Launcher shadow opacity", min: 0, max: 1, step: 0.05 },
]

export const WIDGET_FONT_WEIGHT_OPTIONS: Array<{
  label: string
  value: WidgetThemeTypography["fontWeight"]
}> = [
  { label: "Normal", value: 400 },
  { label: "Medium", value: 500 },
  { label: "Semibold", value: 600 },
  { label: "Bold", value: 700 },
]

export const WIDGET_PREVIEW_SCENES = [
  { key: "launcher", label: "Closed" },
  { key: "empty", label: "New chat" },
  { key: "messages", label: "Messages" },
  { key: "autopilot", label: "Autopilot" },
  { key: "security", label: "Security" },
] as const

export type WidgetPreviewScene = (typeof WIDGET_PREVIEW_SCENES)[number]["key"]

export const cloneWidgetTheme = (theme: WidgetTheme): WidgetTheme => JSON.parse(JSON.stringify(theme)) as WidgetTheme

export const ensureWidgetTheme = (theme: WidgetTheme | null | undefined): WidgetTheme =>
  theme ? cloneWidgetTheme(theme) : cloneWidgetTheme(DEFAULT_WIDGET_THEME)

export const resetWidgetThemeGroup = (
  theme: WidgetTheme,
  variant: WidgetThemeVariant,
  group: "surface" | "messages" | "status" | "typography" | "dimensions" | "shadows",
): WidgetTheme => {
  const next = cloneWidgetTheme(theme)
  if (group === "typography") {
    next[variant].typography = cloneThemeSlice(DEFAULT_WIDGET_THEME[variant].typography)
    return next
  }
  if (group === "dimensions") {
    next[variant].dimensions = cloneThemeSlice(DEFAULT_WIDGET_THEME[variant].dimensions)
    return next
  }
  if (group === "shadows") {
    next[variant].shadows = cloneThemeSlice(DEFAULT_WIDGET_THEME[variant].shadows)
    return next
  }
  const fields = WIDGET_THEME_COLOR_GROUPS.find((item) => item.key === group)?.fields ?? []
  for (const field of fields) {
    next[variant].colors[field.key] = DEFAULT_WIDGET_THEME[variant].colors[field.key]
  }
  return next
}

const cloneThemeSlice = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const normalizeThemeColorInput = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const probe = document.createElement("span")
  probe.style.color = ""
  probe.style.color = trimmed
  if (!probe.style.color) return null
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  const match = computed.match(/^rgba?\(([^)]+)\)$/i)
  if (!match) return null
  const parts = match[1].split(",").map((part) => part.trim())
  if (parts.length < 3) return null
  const [r, g, b] = parts.slice(0, 3).map((part) => Number.parseFloat(part))
  const alpha = parts[3] === undefined ? 1 : Number.parseFloat(parts[3])
  if ([r, g, b].some((part) => Number.isNaN(part))) return null
  const hex = [r, g, b].map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0")).join("")
  if (Number.isNaN(alpha) || alpha >= 0.999) return `#${hex}`.toUpperCase()
  const alphaHex = Math.max(0, Math.min(255, Math.round(alpha * 255))).toString(16).padStart(2, "0")
  return `#${hex}${alphaHex}`.toUpperCase()
}

export const swatchColorValue = (value: string): string => {
  const normalized = normalizeThemeColorInput(value)
  return normalized ? normalized.slice(0, 7) : "#000000"
}
