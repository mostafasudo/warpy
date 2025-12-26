import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, Copy, Info, Link2, Sparkles, Terminal, RotateCw } from "lucide-react"
import clsx from "clsx"

import { PanelShell } from "@/components/panel-shell"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { getApiUrl } from "@/api/client"
import { useAgentQuery } from "@/queries/use-agent"
import { useAgentWidgetSecurityQuery } from "@/queries/use-agent-widget-security"
import { useAgentWidgetConfigQuery } from "@/queries/use-agent-widget-config"
import { useConfigQuery } from "@/queries/use-config"
import { useFeaturesQuery } from "@/queries/use-features"
import { useCreateAgentWidgetApiKey } from "@/mutations/use-create-agent-widget-api-key"
import { useCreateAgent } from "@/mutations/use-create-agent"
import { useDeployAgentWidgetSecurity } from "@/mutations/use-deploy-agent-widget-security"
import { useDiscardAgentWidgetSecurityDraft } from "@/mutations/use-discard-agent-widget-security-draft"
import { useUpdateAgentWidgetSecurityDraft } from "@/mutations/use-update-agent-widget-security-draft"
import { useUpdateAgentWidgetConfig } from "@/mutations/use-update-agent-widget-config"
import { navigationSelectors, useNavigationStore } from "@/stores/navigation"
import { toastSelectors, useToastStore } from "@/stores/toast"

declare const __VITE_WIDGET_CDN_URL__: string | undefined

const getWidgetCdnUrl = (): string => {
  if (typeof __VITE_WIDGET_CDN_URL__ !== "undefined") return __VITE_WIDGET_CDN_URL__
  if (typeof process !== "undefined" && process.env?.VITE_WIDGET_CDN_URL) {
    return process.env.VITE_WIDGET_CDN_URL
  }
  return ""
}

const EmptyState = () => {
  const setSection = useNavigationStore(navigationSelectors.setSection)
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>
      <h3 className="mb-2 text-xl font-semibold">Activate Your Agent</h3>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">
        Your agent will be able to access any endpoint on behalf of the user. For that to work, we
        need you to define your endpoints in the Features tab.
      </p>
      <Button onClick={() => setSection("features")}>
        <Link2 className="mr-2 h-4 w-4" />
        Configure Features
      </Button>
    </div>
  )
}

type EnvironmentTabsProps = {
  environments: string[]
  selected: string
  onSelect: (env: string) => void
}

const EnvironmentTabs = ({ environments, selected, onSelect }: EnvironmentTabsProps) => (
  <div className="mb-6 flex justify-center">
    <div className="inline-flex gap-1 rounded-lg bg-muted/50 p-1">
      {environments.map((env) => (
        <button
          key={env}
          type="button"
          onClick={() => onSelect(env)}
          className={clsx(
            "min-w-24 rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors",
            selected === env
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {env}
        </button>
      ))}
    </div>
  </div>
)

type ScriptDisplayProps = {
  agentId: string
  baseUrl: string
}

const ScriptDisplay = ({ agentId, baseUrl }: ScriptDisplayProps) => {
  const [copied, setCopied] = useState(false)
  const addToast = useToastStore(toastSelectors.addToast)

  const scriptSrc = getWidgetCdnUrl() || `${window.location.origin}/widget/agent.js`
  const scriptCode = `<script src="${scriptSrc}"
        data-agent-id="${agentId}"
        data-base-url="${baseUrl}"></script>`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scriptCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      addToast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "error" })
    }
  }

  return (
    <div className="flex justify-center">
      <div className="flex flex-col items-start gap-4">
        <div>
          <h4 className="mb-1 font-semibold">Activate Your Agent</h4>
          <p className="text-sm text-muted-foreground">
            To activate your agent, embed this script on your website.
          </p>
        </div>
        <div className="relative rounded-lg border border-border bg-muted/30">
          <pre
            className="p-4 pr-20 font-mono text-sm leading-relaxed text-foreground"
            data-testid="script-code"
          >
            {scriptCode}
          </pre>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="absolute right-2 top-2"
            data-testid="copy-script-button"
          >
            {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            Paste before the closing{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary">
              {"</body>"}
            </code>{" "}
            tag.
          </p>
        </div>
      </div>
    </div>
  )
}

const maskApiKey = (last4: string) => `••••••••••••${last4}`

const getAgentServerBaseUrl = (): string => getApiUrl()

const buildWidgetTokenPrompt = (widgetRefreshEndpointPath: string) => {
  return `You are implementing a secure widget token refresh endpoint.

Goal
- Create a server-side endpoint at: POST ${widgetRefreshEndpointPath}

Requirements

- Store the Widget API Key in a server-side environment variable (never expose it to the browser).
- call: POST ${getAgentServerBaseUrl()}/widget-token Authorization: Bearer <WIDGET_API_KEY>
- Return the upstream JSON exactly as: { token: "<jwt>" }
- The JWT is short-lived (~5 minutes). Do not cache.
Notes

- Keep this endpoint protected by your existing dashboard auth/session.
- The widget will retry token refresh automatically on 401.`.trim()
}

type WidgetConfigDraft = {
  widgetTitle: string
  widgetSubtitle: string
  widgetIconUrl: string | null
  widgetEmptyTitle: string
  widgetEmptyDescription: string
  widgetInputPlaceholder: string
}

const DEFAULT_WIDGET_CONFIG: WidgetConfigDraft = {
  widgetTitle: "Warpy",
  widgetSubtitle: "Ready to act",
  widgetIconUrl: null,
  widgetEmptyTitle: "What would you like to do?",
  widgetEmptyDescription: "Ask a question, request help, or describe what you want to get done.",
  widgetInputPlaceholder: "Ask Warpy…"
}

const normalizeWidgetConfig = (value: WidgetConfigDraft) => ({
  widgetTitle: value.widgetTitle.trim(),
  widgetSubtitle: value.widgetSubtitle.trim(),
  widgetIconUrl: value.widgetIconUrl?.trim() ? value.widgetIconUrl.trim() : null,
  widgetEmptyTitle: value.widgetEmptyTitle.trim(),
  widgetEmptyDescription: value.widgetEmptyDescription.trim(),
  widgetInputPlaceholder: value.widgetInputPlaceholder.trim()
})

const DEFAULT_WIDGET_CONFIG_FINGERPRINT = JSON.stringify(normalizeWidgetConfig(DEFAULT_WIDGET_CONFIG))

const ConfigureWidgetPanel = () => {
  const { data, isPending } = useAgentWidgetConfigQuery()
  const updateConfig = useUpdateAgentWidgetConfig()
  const addToast = useToastStore(toastSelectors.addToast)
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<WidgetConfigDraft | null>(null)
  const [iconMode, setIconMode] = useState<"default" | "custom">("default")

  useEffect(() => {
    if (!data) return
    setDraft(data)
    setIconMode(data.widgetIconUrl ? "custom" : "default")
  }, [data])

  const payload = useMemo(() => {
    if (!draft) return null
    return normalizeWidgetConfig({
      ...draft,
      widgetIconUrl: iconMode === "custom" ? draft.widgetIconUrl : null
    })
  }, [draft, iconMode])

  const payloadFingerprint = useMemo(() => (payload ? JSON.stringify(payload) : null), [payload])

  const isDirty = useMemo(() => {
    if (!data || !payloadFingerprint) return false
    return JSON.stringify(normalizeWidgetConfig(data)) !== payloadFingerprint
  }, [data, payloadFingerprint])

  const isCustomConfig = useMemo(() => {
    if (!payloadFingerprint) return false
    return payloadFingerprint !== DEFAULT_WIDGET_CONFIG_FINGERPRINT
  }, [payloadFingerprint])

  const previewIconUrl = useMemo(() => {
    if (!draft) return null
    return iconMode === "custom" ? (draft.widgetIconUrl?.trim() ? draft.widgetIconUrl.trim() : null) : null
  }, [draft, iconMode])

  const handleSave = async () => {
    if (!payload) return
    try {
      await updateConfig.mutateAsync(payload)
      addToast({ title: "Saved", description: "Widget configuration updated.", variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update widget configuration"
      addToast({ title: "Save failed", description: message, variant: "error" })
    }
  }

  const handleDiscard = () => {
    if (!data) return
    setDraft(data)
    setIconMode(data.widgetIconUrl ? "custom" : "default")
  }

  const handleRestoreDefaults = () => {
    setDraft(DEFAULT_WIDGET_CONFIG)
    setIconMode("default")
  }

  if (isPending || !draft) {
    return (
      <div
        className="mt-6 rounded-xl border border-border bg-card/70 p-6 shadow-sm"
        data-testid="configure-widget-loading"
      >
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

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="mt-6 rounded-xl border border-border bg-card/70 shadow-sm">
        <div className="p-6">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Configure Widget</h3>
                  <p className="text-sm text-muted-foreground">Icon and copy</p>
                </div>
                {isDirty ? (
                  <Badge className="h-6 rounded-md bg-primary/10 px-2 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Unsaved
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={isCustomConfig ? "default" : "secondary"}>
                  {isCustomConfig ? "Custom" : "Default"}
                </Badge>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    aria-label={isOpen ? "Collapse configure widget" : "Expand configure widget"}
                  >
                    <span className="text-sm font-medium">{isOpen ? "Hide" : "Show"}</span>
                    <ChevronDown
                      className={clsx("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>

            <CollapsibleContent>
              <div className="space-y-6 pt-2">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
                      {previewIconUrl ? (
                        <img src={previewIconUrl} alt="Widget icon" className="h-5 w-5 rounded-sm object-contain" />
                      ) : (
                        <Sparkles className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{draft.widgetTitle}</p>
                      <p className="truncate text-xs text-muted-foreground">{draft.widgetSubtitle}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="widget-title">Widget title</Label>
                    <Input
                      id="widget-title"
                      value={draft.widgetTitle}
                      onChange={(event) => setDraft({ ...draft, widgetTitle: event.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="widget-subtitle">Widget subtitle</Label>
                    <Input
                      id="widget-subtitle"
                      value={draft.widgetSubtitle}
                      onChange={(event) => setDraft({ ...draft, widgetSubtitle: event.target.value })}
                    />
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
                          <SelectItem value="default">Default sparkles</SelectItem>
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
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="widget-placeholder">Input placeholder</Label>
                    <Input
                      id="widget-placeholder"
                      value={draft.widgetInputPlaceholder}
                      onChange={(event) => setDraft({ ...draft, widgetInputPlaceholder: event.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="widget-empty-title">Empty state title</Label>
                    <Input
                      id="widget-empty-title"
                      value={draft.widgetEmptyTitle}
                      onChange={(event) => setDraft({ ...draft, widgetEmptyTitle: event.target.value })}
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="widget-empty-description">Empty state description</Label>
                    <Textarea
                      id="widget-empty-description"
                      value={draft.widgetEmptyDescription}
                      onChange={(event) => setDraft({ ...draft, widgetEmptyDescription: event.target.value })}
                      className="min-h-20"
                    />
                  </div>
                </div>

                <div className="flex flex-col justify-end gap-2 border-t border-border pt-4 sm:flex-row">
                  <Button
                    variant="ghost"
                    onClick={handleDiscard}
                    disabled={!isDirty || updateConfig.isPending}
                    className="w-full justify-center sm:w-auto"
                  >
                    Discard changes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRestoreDefaults}
                    disabled={updateConfig.isPending}
                    className="w-full justify-center sm:w-auto"
                  >
                    Restore defaults
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!isDirty || updateConfig.isPending}
                    className="w-full justify-center sm:w-auto"
                  >
                    Save changes
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </div>
      </div>
    </Collapsible>
  )
}

const AdvancedSecurityPanel = () => {
  const { data, isPending } = useAgentWidgetSecurityQuery()
  const updateDraft = useUpdateAgentWidgetSecurityDraft()
  const createApiKey = useCreateAgentWidgetApiKey()
  const deployDraft = useDeployAgentWidgetSecurity()
  const discardDraft = useDiscardAgentWidgetSecurityDraft()
  const addToast = useToastStore(toastSelectors.addToast)
  const [isOpen, setIsOpen] = useState(false)

  const active = data?.active
  const draft = data?.draft
  const hasStagedChanges = data?.hasStagedChanges ?? false

  const effectiveRequireSignedWidgetToken =
    draft?.requireSignedWidgetToken ?? active?.requireSignedWidgetToken ?? false
  const effectiveWidgetRefreshEndpointPath =
    draft?.widgetRefreshEndpointPath ?? active?.widgetRefreshEndpointPath ?? "/widget-token"
  const effectiveApiKeyLast4 = draft?.apiKeyLast4 ?? active?.apiKeyLast4

  const showApiKeyStaged = Boolean(draft?.apiKeyLast4)
  const showRefreshEndpointStaged = Boolean(draft?.widgetRefreshEndpointPath)

  const [widgetRefreshEndpointDraft, setWidgetRefreshEndpointDraft] = useState<string>(
    effectiveWidgetRefreshEndpointPath
  )
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    setWidgetRefreshEndpointDraft(effectiveWidgetRefreshEndpointPath)
  }, [effectiveWidgetRefreshEndpointPath])

  const maskedApiKey = useMemo(() => {
    if (!effectiveApiKeyLast4) return null
    return maskApiKey(effectiveApiKeyLast4)
  }, [effectiveApiKeyLast4])

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      addToast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "error" })
    }
  }

  const handleToggle = async (checked: boolean) => {
    try {
      await updateDraft.mutateAsync({ requireSignedWidgetToken: checked })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update widget auth setting"
      addToast({ title: "Update failed", description: message, variant: "error" })
    }
  }

  const submitRefreshEndpoint = async () => {
    const trimmed = widgetRefreshEndpointDraft.trim()
    if (!trimmed.startsWith("/") || trimmed.includes("://")) {
      setWidgetRefreshEndpointDraft(effectiveWidgetRefreshEndpointPath)
      return
    }
    if (trimmed === effectiveWidgetRefreshEndpointPath) return
    try {
      await updateDraft.mutateAsync({ widgetRefreshEndpointPath: trimmed })
    } catch {
      setWidgetRefreshEndpointDraft(effectiveWidgetRefreshEndpointPath)
    }
  }

  const handleGenerateOrRotate = async () => {
    try {
      const created = await createApiKey.mutateAsync()
      setNewApiKey(created.apiKey)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate API key"
      addToast({ title: "API key failed", description: message, variant: "error" })
    }
  }

  const handleDeploy = async () => {
    try {
      await deployDraft.mutateAsync()
      setNewApiKey(null)
      addToast({ title: "Deployed", description: "Advanced Security changes deployed.", variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not deploy changes"
      addToast({ title: "Deploy failed", description: message, variant: "error" })
    }
  }

  const handleDiscard = async () => {
    try {
      await discardDraft.mutateAsync()
      setNewApiKey(null)
      addToast({ title: "Discarded", description: "Staged changes reverted.", variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not discard changes"
      addToast({ title: "Discard failed", description: message, variant: "error" })
    }
  }

  if (isPending) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card/70 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="mt-6 rounded-xl border border-border bg-card/70 shadow-sm">
        <div className="p-6">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Advanced Security</h3>
                  <p className="text-sm text-muted-foreground">Optional Widget JWT Auth</p>
                </div>
                {hasStagedChanges ? (
                  <Badge className="h-6 rounded-md bg-primary/10 px-2 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Staged
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={effectiveRequireSignedWidgetToken ? "default" : "secondary"}>
                  {effectiveRequireSignedWidgetToken ? "Enabled" : "Disabled"}
                </Badge>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    aria-label={isOpen ? "Collapse advanced security" : "Expand advanced security"}
                  >
                    <span className="text-sm font-medium">{isOpen ? "Hide" : "Show"}</span>
                    <ChevronDown
                      className={clsx("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>

            <CollapsibleContent>
              <div className="space-y-6">
                <div className="h-px bg-border" />

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Require signed widget token</p>
                      <p className="text-sm text-muted-foreground">
                        Protect the widget with short-lived JWTs (recommended).
                      </p>
                    </div>
                    <Button
                      onClick={() => void handleToggle(!effectiveRequireSignedWidgetToken)}
                      disabled={updateDraft.isPending}
                      variant={effectiveRequireSignedWidgetToken ? "outline" : "default"}
                      className={clsx("w-full sm:w-auto", "justify-center")}
                    >
                      {effectiveRequireSignedWidgetToken ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Widget API Key</Label>
                    {showApiKeyStaged ? (
                      <Badge className="h-5 rounded-md bg-primary/10 px-2 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Staged
                      </Badge>
                    ) : null}
                  </div>
                  {newApiKey ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">Copy your API key</p>
                          <p className="text-sm text-muted-foreground">This key is shown only once.</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(newApiKey, "apiKey")}
                          disabled={!newApiKey}
                        >
                          {copied === "apiKey" ? "Copied" : "Copy"}
                        </Button>
                      </div>
                      <Textarea className="mt-3 h-10 resize-none font-mono" readOnly rows={1} value={newApiKey} />
                    </div>
                  ) : null}
                  {newApiKey ? null : (
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="flex-1">
                        <Input
                          readOnly
                          disabled={!maskedApiKey}
                          value={maskedApiKey ?? ""}
                          placeholder="No API key generated"
                          className="font-mono"
                        />
                      </div>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={handleGenerateOrRotate}
                        disabled={createApiKey.isPending}
                      >
                        {maskedApiKey ? <RotateCw className="h-4 w-4" /> : <span className="font-semibold">+</span>}
                        {maskedApiKey ? "Rotate" : "Generate Key"}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Widget Refresh Endpoint</Label>
                    {showRefreshEndpointStaged ? (
                      <Badge className="h-5 rounded-md bg-primary/10 px-2 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Staged
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                    <span className="flex items-center border-r border-input bg-muted px-3 font-mono text-sm text-muted-foreground">
                      POST
                    </span>
                    <Input
                      value={widgetRefreshEndpointDraft}
                      onChange={(event) => setWidgetRefreshEndpointDraft(event.target.value)}
                      onBlur={submitRefreshEndpoint}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          submitRefreshEndpoint()
                        }
                      }}
                      className="h-10 min-w-0 flex-1 border-0 bg-transparent font-mono focus-visible:ring-0"
                      aria-label="Widget refresh endpoint path"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <h4 className="mb-2 text-sm font-semibold">Setup</h4>
                  <ol className="ml-4 list-decimal space-y-2 text-sm text-muted-foreground">
                    <li>Store our API key server-side (as an environment variable).</li>
                    <li>
                      Implement{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        POST {effectiveWidgetRefreshEndpointPath}
                      </code>
                      .
                    </li>
                    <li>
                      This endpoint should call{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        POST {getAgentServerBaseUrl()}/widget-token
                      </code>{" "}
                      and return{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        {`{ token: "<jwt>" }`}
                      </code>
                      .
                    </li>
                  </ol>
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => handleCopy(buildWidgetTokenPrompt(effectiveWidgetRefreshEndpointPath), "prompt")}
                    >
                      <Terminal className="h-4 w-4" />
                      {copied === "prompt" ? "Copied" : "Copy prompt for coding agent"}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col justify-end gap-2 border-t border-border pt-4 sm:flex-row">
                  {hasStagedChanges ? (
                    <Button
                      variant="ghost"
                      onClick={handleDiscard}
                      disabled={discardDraft.isPending}
                      className={clsx("w-full sm:w-auto", "justify-center")}
                    >
                      Discard changes
                    </Button>
                  ) : null}
                  <Button
                    onClick={handleDeploy}
                    disabled={!hasStagedChanges || deployDraft.isPending}
                    className={clsx("w-full sm:w-auto", "justify-center")}
                  >
                    Deploy Changes
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </div>
      </div>
    </Collapsible>
  )
}

export const AgentPanel = () => {
  const { data: features, isPending: isFeaturesPending } = useFeaturesQuery("")
  const { data: config, isPending: isConfigPending } = useConfigQuery()
  const { data: agent, isPending: isAgentPending, error: agentError } = useAgentQuery()
  const { mutate: createAgent, isPending: isCreating } = useCreateAgent()

  const baseUrls = config?.baseUrl ?? {}
  const environments = Object.keys(baseUrls).sort()
  const [selectedEnv, setSelectedEnv] = useState<string>("")

  useEffect(() => {
    if (environments.length > 0 && !selectedEnv) {
      setSelectedEnv(environments[0])
    }
  }, [environments, selectedEnv])

  useEffect(() => {
    if (agentError && !agent && !isCreating) {
      createAgent()
    }
  }, [agentError, agent, isCreating, createAgent])

  const isPending = isFeaturesPending || isConfigPending || isAgentPending
  const endpointTotal = (features ?? []).reduce((total, feature) => total + (feature.endpointCount ?? 0), 0)
  const hasEndpoints = endpointTotal > 0

  if (isPending || isCreating) {
    return (
      <PanelShell title="Activate Agent" description="Install the script to enable your agent to perform actions on behalf of your users.">
        <div className="space-y-4" data-testid="agent-panel-loading">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PanelShell>
    )
  }

  if (!hasEndpoints) {
    return (
      <PanelShell title="Activate Agent" description="Install the script to enable your agent to perform actions on behalf of your users.">
        <EmptyState />
      </PanelShell>
    )
  }

  const currentBaseUrl = baseUrls[selectedEnv] ?? ""

  return (
    <PanelShell
      title="Activate Agent"
      description="Install the script to enable your agent to perform actions on behalf of your users."
    >
      <EnvironmentTabs
        environments={environments}
        selected={selectedEnv}
        onSelect={setSelectedEnv}
      />
      {agent ? (
        <>
          <ScriptDisplay agentId={agent.id} baseUrl={currentBaseUrl} />
          <ConfigureWidgetPanel />
          <AdvancedSecurityPanel />
        </>
      ) : null}
    </PanelShell>
  )
}
