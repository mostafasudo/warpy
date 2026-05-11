import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowLeft, Check, ChevronDown, Code2, Copy, Layers, MessageSquare, Palette, Sparkles } from "lucide-react"
import clsx from "clsx"

import { DirtyActions, UnsavedBadge } from "@/components/dirty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useUpdateAgentWidgetConfig } from "@/mutations/use-update-agent-widget-config"
import { useAgentWidgetConfigQuery } from "@/queries/use-agent-widget-config"
import { toastSelectors, useToastStore } from "@/stores/toast"
import type {
  AgentWidgetConfigResponse,
  AgentWidgetConfigUpdate,
  WidgetAppearanceMode,
  WidgetBehavior,
  WidgetResponseMode,
  WidgetTheme,
  WidgetThemeColors,
  WidgetThemeDimensions,
  WidgetThemeShadows,
  WidgetThemeTypography,
} from "@/types"

import {
  DEFAULT_WIDGET_THEME,
  WIDGET_FONT_WEIGHT_OPTIONS,
  WIDGET_THEME_COLOR_GROUPS,
  WIDGET_THEME_DIMENSION_FIELDS,
  WIDGET_THEME_SHADOW_FIELDS,
  WIDGET_THEME_TYPOGRAPHY_FIELDS,
  cloneWidgetTheme,
  ensureWidgetTheme,
  normalizeThemeColorInput,
  resetWidgetThemeGroup,
  swatchColorValue,
  type WidgetPreviewScene,
  type WidgetThemeVariant,
} from "./widget-theme"
import { WidgetThemePreview } from "./widget-theme-preview"

type WidgetConfigDraft = {
  widgetTitle: string
  widgetIconUrl: string | null
  widgetAppearanceMode: WidgetAppearanceMode
  widgetResponseMode: WidgetResponseMode
  widgetTheme: WidgetTheme | null
  widgetBehavior: WidgetBehavior
  widgetEmptyTitle: string
  widgetEmptyDescription: string
  widgetInputPlaceholder: string
  widgetSuggestionsEnabled: boolean
  widgetStarterSuggestions: [string, string, string]
  widgetSecurityDisclosureEnabled: boolean
}

type NativeComponentFramework = "react" | "vue" | "angular" | "svelte" | "vanilla" | "script"

const WIDGET_STARTER_SUGGESTION_LIMIT = 3

const createEmptyStarterSuggestionSlots = (): [string, string, string] => ["", "", ""]

const toWidgetStarterSuggestionSlots = (value: string[] | undefined): [string, string, string] => {
  const slots = createEmptyStarterSuggestionSlots()
  value?.slice(0, WIDGET_STARTER_SUGGESTION_LIMIT).forEach((item, index) => {
    slots[index] = item
  })
  return slots
}

const STARTER_SUGGESTION_PLACEHOLDERS = [
  "Show recent invoices",
  "Create a refund",
  "Summarize open approvals",
] as const

const DEFAULT_WIDGET_CONFIG: AgentWidgetConfigUpdate = {
  widgetTitle: "Warpy",
  widgetIconUrl: null,
  widgetAppearanceMode: "infer",
  widgetResponseMode: "warpy_components",
  widgetTheme: null,
  widgetBehavior: "overlay",
  widgetEmptyTitle: "What would you like to do?",
  widgetEmptyDescription: "Ask a question, request help, or describe what you want to get done.",
  widgetInputPlaceholder: "Ask Warpy…",
  widgetSuggestionsEnabled: false,
  widgetStarterSuggestions: [],
  widgetSecurityDisclosureEnabled: true,
}

const WIDGET_BEHAVIOR_OPTIONS: Array<{
  value: WidgetBehavior
  label: string
  description: string
  icon: typeof Layers
}> = [
  {
    value: "push",
    label: "Push",
    description: "Makes room in the page.",
    icon: ArrowLeft,
  },
  {
    value: "overlay",
    label: "Overlay",
    description: "Opens above the page.",
    icon: Layers,
  },
]

const WIDGET_RESPONSE_MODE_OPTIONS: Array<{
  value: WidgetResponseMode
  title: string
  description: string
  icon: typeof MessageSquare
  recommended?: boolean
}> = [
  {
    value: "markdown",
    title: "Markdown",
    description: "Plain text and markdown replies.",
    icon: MessageSquare,
  },
  {
    value: "warpy_components",
    title: "Warpy components",
    description: "Responsive cards, lists, and tables styled by your widget theme.",
    icon: Sparkles,
    recommended: true,
  },
  {
    value: "native_components",
    title: "Native components",
    description: "Render registered output components from your own app.",
    icon: Code2,
  },
]

const NATIVE_COMPONENT_SNIPPETS: Record<NativeComponentFramework, string> = {
  react: `import { Widget } from "@warpy-ai/widget/react"

const components = [{
  key: "invoice_summary",
  version: "1",
  component: InvoiceSummary
}]

<Widget agentId="..." scriptSrc="..." components={components} />`,
  vue: `<WarpyWidget
  agent-id="..."
  script-src="..."
  :components="[{ key: 'invoice_summary', version: '1', component: InvoiceSummary }]"
/>`,
  angular: `components = [{
  key: "invoice_summary",
  version: "1",
  render: ({ mount, props }) => {
    // Mount your Angular component with your app's injector.
  }
}]

<warpy-widget
  agentId="..."
  scriptSrc="..."
  [components]="components">
</warpy-widget>`,
  svelte: `<WarpyWidget
  agentId="..."
  scriptSrc="..."
  components={[{ key: 'invoice_summary', version: '1', component: InvoiceSummary }]}
/>`,
  vanilla: `import { mountWidget } from "@warpy-ai/widget"

mountWidget({
  agentId: "...",
  scriptSrc: "...",
  components: [{
    key: "invoice_summary",
    version: "1",
    render: ({ mount, props }) => mount.replaceChildren(renderInvoiceSummary(props))
  }]
})`,
  script: `<script>
  window.warpy?.registerComponents?.([{
    key: "invoice_summary",
    version: "1",
    render({ mount, props }) {
      mount.textContent = props.content
    }
  }])
</script>`,
}

const createWidgetConfigDraft = (value: AgentWidgetConfigResponse): WidgetConfigDraft => ({
  widgetTitle: value.widgetTitle,
  widgetIconUrl: value.widgetIconUrl,
  widgetAppearanceMode: value.widgetAppearanceMode,
  widgetResponseMode: value.widgetResponseMode ?? "warpy_components",
  widgetTheme: value.widgetTheme ? cloneWidgetTheme(value.widgetTheme) : null,
  widgetBehavior: value.widgetBehavior === "push" ? "push" : "overlay",
  widgetEmptyTitle: value.widgetEmptyTitle,
  widgetEmptyDescription: value.widgetEmptyDescription,
  widgetInputPlaceholder: value.widgetInputPlaceholder,
  widgetSuggestionsEnabled: value.widgetSuggestionsEnabled,
  widgetStarterSuggestions: toWidgetStarterSuggestionSlots(value.widgetStarterSuggestions),
  widgetSecurityDisclosureEnabled: value.widgetSecurityDisclosureEnabled,
})

const normalizeWidgetConfig = (value: WidgetConfigDraft): AgentWidgetConfigUpdate => {
  const nextTheme =
    value.widgetTheme === null && value.widgetAppearanceMode === "custom"
      ? ensureWidgetTheme(null)
      : value.widgetTheme

  return {
    widgetTitle: value.widgetTitle.trim(),
    widgetIconUrl: value.widgetIconUrl?.trim() ? value.widgetIconUrl.trim() : null,
    widgetAppearanceMode: value.widgetAppearanceMode,
    widgetResponseMode: value.widgetResponseMode,
    widgetTheme: nextTheme ? cloneWidgetTheme(nextTheme) : null,
    widgetBehavior: value.widgetBehavior,
    widgetEmptyTitle: value.widgetEmptyTitle.trim(),
    widgetEmptyDescription: value.widgetEmptyDescription.trim(),
    widgetInputPlaceholder: value.widgetInputPlaceholder.trim(),
    widgetSuggestionsEnabled: value.widgetSuggestionsEnabled,
    widgetStarterSuggestions: value.widgetStarterSuggestions.map((item) => item.trim()).filter(Boolean).slice(0, WIDGET_STARTER_SUGGESTION_LIMIT),
    widgetSecurityDisclosureEnabled: value.widgetSecurityDisclosureEnabled,
  }
}

const ThemeCard = ({
  children,
  description,
  title,
}: {
  children: ReactNode
  description?: string
  title: string
}) => (
  <div className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm">
    <div className="mb-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {children}
  </div>
)

const ThemeColorControl = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) => (
  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_76px_130px] sm:items-center">
    <Label className="text-sm font-medium">{label}</Label>
    <Input
      type="color"
      value={swatchColorValue(value)}
      onChange={(event) => {
        const next = event.target.value.toUpperCase()
        const suffix = value.length === 9 ? value.slice(7).toUpperCase() : ""
        onChange(`${next}${suffix}`)
      }}
      className="h-10 w-full cursor-pointer rounded-xl p-1"
      aria-label={`${label} swatch`}
    />
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => {
        const normalized = normalizeThemeColorInput(event.target.value)
        if (normalized) onChange(normalized)
      }}
      placeholder="#FFFFFF"
      className="font-mono text-sm"
      aria-label={label}
    />
  </div>
)

const ThemeRangeControl = ({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) => (
  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px] sm:items-center">
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
    </div>
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)))
      }}
      aria-label={label}
    />
  </div>
)

const normalizeNumber = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback)

export const ConfigureWidgetPanelContent = () => {
  const { data, isPending } = useAgentWidgetConfigQuery()
  const updateConfig = useUpdateAgentWidgetConfig()
  const addToast = useToastStore(toastSelectors.addToast)
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<WidgetConfigDraft | null>(null)
  const [iconMode, setIconMode] = useState<"default" | "custom">("default")
  const [themeVariant, setThemeVariant] = useState<WidgetThemeVariant>("light")
  const [previewScene, setPreviewScene] = useState<WidgetPreviewScene>("launcher")
  const [nativeComponentsOpen, setNativeComponentsOpen] = useState(false)
  const [nativeFramework, setNativeFramework] = useState<NativeComponentFramework>("react")
  const [nativeSnippetCopied, setNativeSnippetCopied] = useState(false)
  const widgetBehaviorOptionRefs = useRef<Record<WidgetBehavior, HTMLButtonElement | null>>({
    overlay: null,
    push: null,
  })

  const payload = useMemo(() => {
    if (!draft) return null
    return normalizeWidgetConfig({
      ...draft,
      widgetIconUrl: iconMode === "custom" ? draft.widgetIconUrl : null,
    })
  }, [draft, iconMode])

  const payloadFingerprint = useMemo(() => (payload ? JSON.stringify(payload) : null), [payload])
  const savedFingerprint = useMemo(() => (data ? JSON.stringify(normalizeWidgetConfig(createWidgetConfigDraft(data))) : null), [data])
  const isDirty = Boolean(payloadFingerprint && savedFingerprint && payloadFingerprint !== savedFingerprint)

  useEffect(() => {
    if (!data) return
    const nextDraft = createWidgetConfigDraft(data)
    const nextFingerprint = JSON.stringify(normalizeWidgetConfig(nextDraft))
    if (!draft || payloadFingerprint === nextFingerprint) {
      setDraft(nextDraft)
      setIconMode(data.widgetIconUrl ? "custom" : "default")
    }
  }, [data, payloadFingerprint])

  const suggestionsValidationMessage = useMemo(() => {
    if (!payload?.widgetSuggestionsEnabled) return null
    if (payload.widgetStarterSuggestions.length === 0) {
      return "Add at least one starter suggestion before saving."
    }
    return null
  }, [payload])

  const previewIconUrl = useMemo(() => {
    if (!draft) return null
    return iconMode === "custom" ? (draft.widgetIconUrl?.trim() ? draft.widgetIconUrl.trim() : null) : null
  }, [draft, iconMode])

  const setWidgetBehavior = (value: WidgetBehavior, options?: { focus?: boolean }) => {
    setDraft((current) => (current ? { ...current, widgetBehavior: value } : current))
    if (options?.focus) {
      widgetBehaviorOptionRefs.current[value]?.focus()
    }
  }

  const handleWidgetBehaviorKeyDown = (event: KeyboardEvent<HTMLButtonElement>, fallbackIndex: number) => {
    if (!draft) return
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return
    event.preventDefault()
    const currentIndex = WIDGET_BEHAVIOR_OPTIONS.findIndex((option) => option.value === draft.widgetBehavior)
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1
    const baseIndex = currentIndex === -1 ? fallbackIndex : currentIndex
    const nextIndex = (baseIndex + direction + WIDGET_BEHAVIOR_OPTIONS.length) % WIDGET_BEHAVIOR_OPTIONS.length
    setWidgetBehavior(WIDGET_BEHAVIOR_OPTIONS[nextIndex].value, { focus: true })
  }

  const updateThemeMode = (updater: (theme: WidgetTheme) => WidgetTheme) => {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        widgetTheme: updater(ensureWidgetTheme(current.widgetTheme)),
      }
    })
  }

  const updateThemeColor = (key: keyof WidgetThemeColors, value: string) => {
    updateThemeMode((theme) => {
      const next = cloneWidgetTheme(theme)
      next[themeVariant].colors[key] = value
      return next
    })
  }

  const updateThemeTypography = (key: keyof WidgetThemeTypography, value: WidgetThemeTypography[keyof WidgetThemeTypography]) => {
    updateThemeMode((theme) => {
      const next = cloneWidgetTheme(theme)
      ;(next[themeVariant].typography[key] as WidgetThemeTypography[keyof WidgetThemeTypography]) = value
      return next
    })
  }

  const updateThemeDimensions = (key: keyof WidgetThemeDimensions, value: number) => {
    updateThemeMode((theme) => {
      const next = cloneWidgetTheme(theme)
      next[themeVariant].dimensions[key] = value
      return next
    })
  }

  const updateThemeShadows = (key: keyof WidgetThemeShadows, value: number) => {
    updateThemeMode((theme) => {
      const next = cloneWidgetTheme(theme)
      next[themeVariant].shadows[key] = value
      return next
    })
  }

  const handleSave = async () => {
    if (!payload) return
    if (suggestionsValidationMessage) {
      addToast({ title: "Save failed", description: suggestionsValidationMessage, variant: "error" })
      return
    }
    try {
      await updateConfig.mutateAsync(payload)
      addToast({ title: "Saved", description: "Widget configuration updated.", variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update widget configuration"
      addToast({ title: "Save failed", description: message, variant: "error" })
    }
  }

  const handleNativeSnippetCopy = async () => {
    try {
      await navigator.clipboard.writeText(NATIVE_COMPONENT_SNIPPETS[nativeFramework])
      setNativeSnippetCopied(true)
      setTimeout(() => setNativeSnippetCopied(false), 2000)
    } catch {
      addToast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "error" })
    }
  }

  const handleDiscard = () => {
    if (!data) return
    setDraft(createWidgetConfigDraft(data))
    setIconMode(data.widgetIconUrl ? "custom" : "default")
  }

  const handleRestoreDefaults = () => {
    setDraft(createWidgetConfigDraft(DEFAULT_WIDGET_CONFIG))
    setIconMode("default")
    setThemeVariant("light")
    setPreviewScene("launcher")
  }

  if (isPending || !draft) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card/70 p-6 shadow-sm" data-testid="configure-widget-loading">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full sm:col-span-2" />
        </div>
      </div>
    )
  }

  const resolvedTheme = ensureWidgetTheme(draft.widgetTheme)
  const activeThemeMode = resolvedTheme[themeVariant]
  const suggestionsCount = payload?.widgetStarterSuggestions.length ?? 0

  return (
    <>
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="mt-6 rounded-xl border border-border bg-card/70 shadow-sm">
        <div className="p-6">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Configure Widget</h3>
                  <p className="text-sm text-muted-foreground">Appearance, content, and live preview</p>
                </div>
                {isDirty ? <UnsavedBadge className="h-6" /> : null}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={draft.widgetAppearanceMode === "custom" ? "default" : "secondary"}>
                  {draft.widgetAppearanceMode === "custom" ? "Custom theme" : "Infer from page"}
                </Badge>
                <Badge variant={draft.widgetResponseMode === "warpy_components" ? "default" : "secondary"}>
                  {draft.widgetResponseMode === "warpy_components"
                    ? "Warpy components"
                    : draft.widgetResponseMode === "native_components"
                      ? "Native components"
                      : "Markdown"}
                </Badge>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    aria-label={isOpen ? "Collapse configure widget" : "Expand configure widget"}
                  >
                    <span className="text-sm font-medium">{isOpen ? "Hide" : "Show"}</span>
                    <ChevronDown className={clsx("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>

            <CollapsibleContent>
              <div
                className={clsx(
                  "pt-2",
                  draft.widgetAppearanceMode === "custom" ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]" : "space-y-6",
                )}
              >
                <div className="space-y-6">
                  <ThemeCard title="Appearance mode" description="Choose between runtime host inheritance or an explicit light/dark theme.">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([
                        {
                          value: "infer" as const,
                          title: "Infer from page",
                          description: "Reads your dashboard’s colors and typography at runtime.",
                          icon: MessageSquare,
                        },
                        {
                          value: "custom" as const,
                          title: "Custom theme",
                          description: "Define the widget’s light and dark appearance explicitly with a live preview.",
                          icon: Palette,
                        },
                      ]).map((option) => {
                        const Icon = option.icon
                        const selected = draft.widgetAppearanceMode === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      widgetAppearanceMode: option.value,
                                      widgetTheme:
                                        option.value === "custom"
                                          ? ensureWidgetTheme(current.widgetTheme)
                                          : current.widgetTheme,
                                    }
                                  : current,
                              )
                            }
                            className={clsx(
                              "rounded-2xl border px-4 py-4 text-left transition-colors",
                              selected
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border/70 bg-muted/10 hover:border-primary/40 hover:bg-muted/20",
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={clsx(
                                  "flex h-10 w-10 items-center justify-center rounded-xl border",
                                  selected
                                    ? "border-primary/30 bg-primary/10 text-primary"
                                    : "border-border/70 bg-background/80 text-muted-foreground",
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold">{option.title}</p>
                                  {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                                </div>
                                <p className="text-sm text-muted-foreground">{option.description}</p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </ThemeCard>

                  <ThemeCard
                    title="Response mode"
                    description="Choose how assistant replies render inside the widget. Warpy components are responsive-first and stay visually quiet inside narrow panels."
                  >
                    <div className="grid gap-3">
                      {WIDGET_RESPONSE_MODE_OPTIONS.map((option) => {
                        const Icon = option.icon
                        const selected = draft.widgetResponseMode === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      widgetResponseMode: option.value,
                                    }
                                  : current,
                              )
                            }
                            aria-pressed={selected}
                            className={clsx(
                              "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border px-4 py-4 text-left transition-colors",
                              selected
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border/70 bg-muted/10 hover:border-primary/40 hover:bg-muted/20",
                            )}
                          >
                            <div
                              className={clsx(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                                selected
                                  ? "border-primary/30 bg-primary/10 text-primary"
                                  : "border-border/70 bg-background/80 text-muted-foreground",
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <p className="min-w-0 text-sm font-semibold leading-5">{option.title}</p>
                                {option.recommended ? (
                                  <Badge variant="secondary" className="shrink-0 px-2 py-0 text-[11px]">
                                    Recommended
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="max-w-2xl break-words text-sm leading-5 text-muted-foreground">
                                {option.description}
                              </p>
                            </div>
                            <span
                              aria-hidden="true"
                              className={clsx(
                                "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border/70 bg-background/70",
                              )}
                            >
                              {selected ? <Check className="h-3.5 w-3.5" /> : null}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {draft.widgetResponseMode === "native_components" ? (
                      <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">Connect your app components</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Register output-only components and keep their prop schemas in sync through the Warpy API.
                            </p>
                          </div>
                          <Button type="button" variant="outline" onClick={() => setNativeComponentsOpen(true)}>
                            <Code2 className="mr-2 h-4 w-4" />
                            Connect components
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </ThemeCard>

                  <ThemeCard title="Launcher & basics">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="widget-title">Widget name</Label>
                        <Input
                          id="widget-title"
                          value={draft.widgetTitle}
                          onChange={(event) => setDraft({ ...draft, widgetTitle: event.target.value })}
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <Label>Widget behavior</Label>
                        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Widget behavior">
                          {WIDGET_BEHAVIOR_OPTIONS.map((option, index) => {
                            const selected = draft.widgetBehavior === option.value
                            const Icon = option.icon
                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                tabIndex={selected ? 0 : -1}
                                ref={(node) => {
                                  widgetBehaviorOptionRefs.current[option.value] = node
                                }}
                                onClick={() => setWidgetBehavior(option.value)}
                                onKeyDown={(event) => handleWidgetBehaviorKeyDown(event, index)}
                                className={clsx(
                                  "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                                  selected
                                    ? "border-primary bg-primary/5 text-foreground shadow-sm"
                                    : "border-border bg-background hover:border-primary/40 hover:bg-muted/30",
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <div
                                    className={clsx(
                                      "mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border",
                                      selected
                                        ? "border-primary/30 bg-primary/10 text-primary"
                                        : "border-border bg-muted/40 text-muted-foreground",
                                    )}
                                  >
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold">{option.label}</p>
                                    <p className="text-sm text-muted-foreground">{option.description}</p>
                                  </div>
                                </div>
                                {selected ? <Check className="mt-1 h-4 w-4 text-primary" /> : null}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <Label>Widget icon</Label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Select
                            value={iconMode}
                            onValueChange={(value) => {
                              const next = value === "custom" ? "custom" : "default"
                              setIconMode(next)
                              if (next === "default") {
                                setDraft({ ...draft, widgetIconUrl: null })
                              } else if (draft.widgetIconUrl === null) {
                                setDraft({ ...draft, widgetIconUrl: "" })
                              }
                            }}
                          >
                            <SelectTrigger aria-label="Widget icon mode">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Default bubble</SelectItem>
                              <SelectItem value="custom">Custom image URL</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={iconMode === "custom" ? draft.widgetIconUrl ?? "" : ""}
                            onChange={(event) => setDraft({ ...draft, widgetIconUrl: event.target.value })}
                            disabled={iconMode !== "custom"}
                            placeholder="https://example.com/icon.png"
                            aria-label="Widget icon URL"
                          />
                        </div>
                        {previewIconUrl ? (
                          <div className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-muted/10 px-3 py-2">
                            <img src={previewIconUrl} alt="Widget icon" className="h-5 w-5 rounded-sm object-contain" />
                            <span className="text-sm text-muted-foreground">Custom icon preview</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </ThemeCard>

                  <ThemeCard title="Conversation copy">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="widget-placeholder">Input placeholder</Label>
                        <Input
                          id="widget-placeholder"
                          value={draft.widgetInputPlaceholder}
                          onChange={(event) => setDraft({ ...draft, widgetInputPlaceholder: event.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="widget-empty-title">Empty state title (optional)</Label>
                        <Input
                          id="widget-empty-title"
                          value={draft.widgetEmptyTitle}
                          onChange={(event) => setDraft({ ...draft, widgetEmptyTitle: event.target.value })}
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="widget-empty-description">Empty state description (optional)</Label>
                        <Textarea
                          id="widget-empty-description"
                          value={draft.widgetEmptyDescription}
                          onChange={(event) => setDraft({ ...draft, widgetEmptyDescription: event.target.value })}
                          className="min-h-20"
                        />
                      </div>
                    </div>
                  </ThemeCard>

                  <ThemeCard title="Suggestions" description="Starter suggestions appear in a brand-new chat and update the live preview instantly.">
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="widget-suggestions-toggle" className="text-sm font-semibold">
                            Suggestions
                          </Label>
                          <Badge variant={draft.widgetSuggestionsEnabled ? "default" : "secondary"}>
                            {draft.widgetSuggestionsEnabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Show starter suggestions in a new chat and let the agent suggest follow-ups after replies.
                        </p>
                      </div>
                      <Switch
                        id="widget-suggestions-toggle"
                        checked={draft.widgetSuggestionsEnabled}
                        onCheckedChange={(checked) => setDraft({ ...draft, widgetSuggestionsEnabled: checked })}
                        aria-label="Toggle widget suggestions"
                      />
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">Starter suggestions</p>
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          {suggestionsCount}/{WIDGET_STARTER_SUGGESTION_LIMIT} saved
                        </p>
                      </div>
                      {STARTER_SUGGESTION_PLACEHOLDERS.map((placeholder, index) => (
                        <div key={placeholder} className="space-y-2">
                          <Label htmlFor={`starter-suggestion-${index + 1}`}>Starter suggestion {index + 1}</Label>
                          <Input
                            id={`starter-suggestion-${index + 1}`}
                            value={draft.widgetStarterSuggestions[index]}
                            onChange={(event) => {
                              const nextSuggestions = [...draft.widgetStarterSuggestions] as [string, string, string]
                              nextSuggestions[index] = event.target.value
                              setDraft({ ...draft, widgetStarterSuggestions: nextSuggestions })
                            }}
                            placeholder={placeholder}
                          />
                        </div>
                      ))}
                      {suggestionsValidationMessage ? (
                        <p className="text-sm text-destructive">{suggestionsValidationMessage}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Use short, clickable asks like “Show recent invoices” or “Create a refund”.
                        </p>
                      )}
                    </div>
                  </ThemeCard>

                  <ThemeCard title="Safety disclosure">
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="security-disclosure-toggle" className="text-sm font-semibold">
                            Show Security & Privacy Disclosure
                          </Label>
                          <span className="text-xs text-muted-foreground">(Recommended)</span>
                        </div>
                        <p className="text-sm text-muted-foreground">The preview security button only appears when this is enabled.</p>
                      </div>
                      <Switch
                        id="security-disclosure-toggle"
                        checked={draft.widgetSecurityDisclosureEnabled}
                        onCheckedChange={(checked) => setDraft({ ...draft, widgetSecurityDisclosureEnabled: checked })}
                      />
                    </div>
                  </ThemeCard>

                  {draft.widgetAppearanceMode === "custom" ? (
                    <>
                      <ThemeCard title="Theme variant" description="Edit the light and dark themes separately. The preview follows the selected variant.">
                        <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1">
                          {(["light", "dark"] as const).map((variant) => (
                            <button
                              key={variant}
                              type="button"
                              onClick={() => setThemeVariant(variant)}
                              className={clsx(
                                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                                themeVariant === variant
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "text-muted-foreground hover:bg-background hover:text-foreground",
                              )}
                            >
                              {variant === "light" ? "Light theme" : "Dark theme"}
                            </button>
                          ))}
                        </div>
                      </ThemeCard>

                      {WIDGET_THEME_COLOR_GROUPS.map((group) => (
                        <ThemeCard
                          key={group.key}
                          title={group.label}
                          description={`Reset only this ${group.label.toLowerCase()} group without touching the rest of the theme.`}
                        >
                          <div className="mb-4 flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => updateThemeMode((theme) => resetWidgetThemeGroup(theme, themeVariant, group.key))}
                            >
                              Reset {group.label}
                            </Button>
                          </div>
                          <div className="space-y-4">
                            {group.fields.map((field) => (
                              <ThemeColorControl
                                key={field.key}
                                label={field.label}
                                value={activeThemeMode.colors[field.key]}
                                onChange={(value) => updateThemeColor(field.key, value)}
                              />
                            ))}
                          </div>
                        </ThemeCard>
                      ))}

                      <ThemeCard title="Typography">
                        <div className="mb-4 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => updateThemeMode((theme) => resetWidgetThemeGroup(theme, themeVariant, "typography"))}
                          >
                            Reset typography
                          </Button>
                        </div>
                        <div className="space-y-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`theme-font-family-${themeVariant}`}>Font family</Label>
                              <Input
                                id={`theme-font-family-${themeVariant}`}
                                value={activeThemeMode.typography.fontFamily}
                                onChange={(event) => updateThemeTypography("fontFamily", event.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`theme-font-weight-${themeVariant}`}>Font weight</Label>
                              <Select
                                value={String(activeThemeMode.typography.fontWeight)}
                                onValueChange={(value) => updateThemeTypography("fontWeight", Number(value) as 400 | 500 | 600 | 700)}
                              >
                                <SelectTrigger id={`theme-font-weight-${themeVariant}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {WIDGET_FONT_WEIGHT_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={String(option.value)}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {WIDGET_THEME_TYPOGRAPHY_FIELDS.map((field) => (
                            <ThemeRangeControl
                              key={field.key}
                              label={field.label}
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={normalizeNumber(Number(activeThemeMode.typography[field.key]), field.min)}
                              onChange={(value) => updateThemeTypography(field.key, value)}
                            />
                          ))}
                        </div>
                      </ThemeCard>

                      <ThemeCard title="Layout">
                        <div className="mb-4 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => updateThemeMode((theme) => resetWidgetThemeGroup(theme, themeVariant, "dimensions"))}
                          >
                            Reset layout
                          </Button>
                        </div>
                        <div className="space-y-4">
                          {WIDGET_THEME_DIMENSION_FIELDS.map((field) => (
                            <ThemeRangeControl
                              key={field.key}
                              label={field.label}
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={normalizeNumber(Number(activeThemeMode.dimensions[field.key]), field.min)}
                              onChange={(value) => updateThemeDimensions(field.key, value)}
                            />
                          ))}
                        </div>
                      </ThemeCard>

                      <ThemeCard title="Shadows">
                        <div className="mb-4 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => updateThemeMode((theme) => resetWidgetThemeGroup(theme, themeVariant, "shadows"))}
                          >
                            Reset shadows
                          </Button>
                        </div>
                        <div className="space-y-4">
                          {WIDGET_THEME_SHADOW_FIELDS.map((field) => (
                            <ThemeRangeControl
                              key={field.key}
                              label={field.label}
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={normalizeNumber(Number(activeThemeMode.shadows[field.key]), field.min)}
                              onChange={(value) => updateThemeShadows(field.key, value)}
                            />
                          ))}
                        </div>
                      </ThemeCard>
                    </>
                  ) : null}

                  <DirtyActions
                    onDiscard={handleDiscard}
                    discardDisabled={!isDirty || updateConfig.isPending}
                    onPrimary={handleSave}
                    primaryDisabled={!isDirty || updateConfig.isPending || Boolean(suggestionsValidationMessage)}
                    secondaryAction={
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                        {draft.widgetAppearanceMode === "custom" ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      widgetTheme: cloneWidgetTheme(DEFAULT_WIDGET_THEME),
                                    }
                                  : current,
                              )
                            }
                            disabled={updateConfig.isPending}
                            className="w-full justify-center sm:w-auto"
                          >
                            Reset theme
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          onClick={handleRestoreDefaults}
                          disabled={updateConfig.isPending}
                          className="w-full justify-center sm:w-auto"
                        >
                          Restore defaults
                        </Button>
                      </div>
                    }
                  />
                </div>

                {draft.widgetAppearanceMode === "custom" && payload ? (
                  <WidgetThemePreview
                    draftConfig={payload}
                    previewScene={previewScene}
                    previewVariant={themeVariant}
                    onPreviewSceneChange={setPreviewScene}
                    onPreviewVariantChange={setThemeVariant}
                  />
                ) : null}
              </div>
            </CollapsibleContent>
          </div>
        </div>
      </div>
    </Collapsible>
    <Dialog open={nativeComponentsOpen} onOpenChange={setNativeComponentsOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Connect native components</DialogTitle>
          <DialogDescription>
            Native mode renders components from your app. Warpy only stores the component contract and complete markdown fallback.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-start">
            <div className="space-y-2">
              <Label htmlFor="native-component-framework">Framework</Label>
              <Select
                value={nativeFramework}
                onValueChange={(value) => setNativeFramework(value as NativeComponentFramework)}
              >
                <SelectTrigger id="native-component-framework" aria-label="Native component framework">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="react">React</SelectItem>
                  <SelectItem value="vue">Vue</SelectItem>
                  <SelectItem value="angular">Angular</SelectItem>
                  <SelectItem value="svelte">Svelte</SelectItem>
                  <SelectItem value="vanilla">Vanilla JS</SelectItem>
                  <SelectItem value="script">Script tag</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div
              className="rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground sm:mt-6"
              data-testid="native-components-api-guidance"
            >
              Use <code className="rounded bg-background px-1 py-0.5">/widget-components</code> through the Warpy API to add,
              update, or remove components. Your agent should diff local prop types against Warpy, then apply changes after your
              approval.
            </div>
          </div>
          <div className="relative rounded-xl border border-border bg-muted/30">
            <pre
              className="max-h-72 overflow-auto p-4 pr-24 text-xs text-foreground"
              data-testid="native-components-snippet"
            >
              <code>{NATIVE_COMPONENT_SNIPPETS[nativeFramework]}</code>
            </pre>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="absolute right-2 top-2 bg-background/80"
              onClick={() => void handleNativeSnippetCopy()}
              data-testid="copy-native-components-snippet-button"
            >
              {nativeSnippetCopied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
              {nativeSnippetCopied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
            Components must be output-only. Include precise prop descriptions, character limits, row/item limits, and when Warpy should avoid the component. If the reply does not fully fit, Warpy uses markdown.
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
