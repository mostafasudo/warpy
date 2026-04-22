import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, Copy, Info } from "lucide-react"
import clsx from "clsx"

import { DirtyActions, UnsavedBadge } from "@/components/dirty-state"
import { PanelShell } from "@/components/panel-shell"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { getApiUrl } from "@/api/client"
import { buildWidgetTokenRefreshPrompt, maskApiKey } from "@/lib/agent-integration"
import { buildScriptSnippet, getWidgetCdnUrl, normalizeCustomerBaseUrl } from "@/lib/widget-install"
import { useAgentQuery } from "@/queries/use-agent"
import { useApiKeyQuery } from "@/queries/use-api-key"
import { useAgentWidgetSecurityQuery } from "@/queries/use-agent-widget-security"
import { useAgentWidgetInstallQuery } from "@/queries/use-agent-widget-install"
import { useConfigQuery } from "@/queries/use-config"
import { useCreateAgent } from "@/mutations/use-create-agent"
import { useDeployAgentWidgetSecurity } from "@/mutations/use-deploy-agent-widget-security"
import { useDiscardAgentWidgetSecurityDraft } from "@/mutations/use-discard-agent-widget-security-draft"
import { useUpdateAgentWidgetSecurityDraft } from "@/mutations/use-update-agent-widget-security-draft"
import { useUpdateAgentWidgetInstall } from "@/mutations/use-update-agent-widget-install"
import { useUpdateAgentFrontendCapability } from "@/mutations/use-update-agent-frontend-capability"
import { useUpdateAgentCustomSystemPrompt } from "@/mutations/use-update-agent-custom-system-prompt"
import { useUpdateAgentUserRateLimits } from "@/mutations/use-update-agent-user-rate-limits"
import { navigationSelectors, useNavigationStore } from "@/stores/navigation"
import { toastSelectors, useToastStore } from "@/stores/toast"
import type { WidgetInstallFramework, WidgetInstallPackageManager } from "@/types"
import { useAgentFrontendCapabilityQuery } from "@/queries/use-agent-frontend-capability"
import { useAgentCustomSystemPromptQuery } from "@/queries/use-agent-custom-system-prompt"
import { useAgentUserRateLimitsQuery } from "@/queries/use-agent-user-rate-limits"
import { ConfigureWidgetPanelContent } from "./configure-widget-panel"

type EnvironmentTabsProps = {
  environments: string[]
  selected: string
  onSelect: (env: string) => void
}

const EnvironmentTabs = ({ environments, selected, onSelect }: EnvironmentTabsProps) => (
  <ScrollArea className="max-w-[36rem]" type="always">
    <div className="inline-flex min-w-max gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
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
  </ScrollArea>
)

type WidgetInstallDisplayProps = {
  agentId: string
  baseUrl: string
}

type CodeSnippetProps = {
  code: string
  copied: boolean
  onCopy: () => void
  testId: string
  buttonTestId: string
}

const DEFAULT_WIDGET_INSTALL: {
  framework: WidgetInstallFramework
  packageManager: WidgetInstallPackageManager
} = {
  framework: "react",
  packageManager: "npm"
}

const FRAMEWORK_OPTIONS: Array<{ value: WidgetInstallFramework; label: string }> = [
  { value: "react", label: "React" },
  { value: "angular", label: "Angular" },
  { value: "vue", label: "Vue" },
  { value: "svelte", label: "Svelte" },
  { value: "vanilla", label: "Vanilla JS" },
  { value: "script", label: "Script tag" }
]

const PACKAGE_MANAGER_OPTIONS: Array<{ value: WidgetInstallPackageManager; label: string }> = [
  { value: "npm", label: "npm" },
  { value: "pnpm", label: "pnpm" },
  { value: "yarn", label: "yarn" }
]

const buildInstallCommand = (packageManager: WidgetInstallPackageManager) => {
  if (packageManager === "pnpm") return "pnpm add @warpy-ai/widget"
  if (packageManager === "yarn") return "yarn add @warpy-ai/widget"
  return "npm install @warpy-ai/widget"
}

const buildUsageSnippet = ({
  framework,
  agentId,
  baseUrl,
  scriptSrc,
  scriptSnippet
}: {
  framework: WidgetInstallFramework
  agentId: string
  baseUrl: string
  scriptSrc: string
  scriptSnippet: string
}) => {
  const normalizedBaseUrl = normalizeCustomerBaseUrl(baseUrl)
  const baseUrlProp = normalizedBaseUrl ? `\n  baseUrl="${normalizedBaseUrl}"` : ""
  const baseUrlObjectEntry = normalizedBaseUrl ? `\n    baseUrl: "${normalizedBaseUrl}",` : ""
  if (framework === "script") return scriptSnippet
  if (framework === "react") {
    return `import { Widget } from "@warpy-ai/widget/react"

<Widget
  agentId="${agentId}"${baseUrlProp}
  scriptSrc="${scriptSrc}"
/>`
  }
  if (framework === "vue") {
    return `import { Widget } from "@warpy-ai/widget/vue"

<Widget
  agentId="${agentId}"${baseUrlProp}
  scriptSrc="${scriptSrc}"
/>`
  }
  if (framework === "angular") {
    return `import { WidgetComponent } from "@warpy-ai/widget/angular"

<warpy-widget
  agentId="${agentId}"${baseUrlProp}
  scriptSrc="${scriptSrc}"
></warpy-widget>`
  }
  if (framework === "svelte") {
    return `import Widget from "@warpy-ai/widget/svelte"

<Widget
  agentId="${agentId}"${baseUrlProp}
  scriptSrc="${scriptSrc}"
/>`
  }
  return `import { mountWidget } from "@warpy-ai/widget"

let widget = null
const shouldShow = true

if (shouldShow) {
  widget = mountWidget({
    agentId: "${agentId}",${baseUrlObjectEntry}
    scriptSrc: "${scriptSrc}"
  })
}

const hideWidget = () => {
  widget?.unmount()
  widget = null
}`
}

const CodeSnippet = ({ code, copied, onCopy, testId, buttonTestId }: CodeSnippetProps) => (
  <div className="relative rounded-lg border border-border bg-muted/30">
    <pre className="whitespace-pre-wrap break-words p-4 pr-20 font-mono text-sm leading-relaxed text-foreground" data-testid={testId}>
      <code className="font-mono">{code}</code>
    </pre>
    <Button
      size="sm"
      variant="ghost"
      onClick={onCopy}
      className="absolute right-2 top-2"
      data-testid={buttonTestId}
    >
      {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  </div>
)

const WidgetInstallDisplay = ({ agentId, baseUrl }: WidgetInstallDisplayProps) => {
  const { data } = useAgentWidgetInstallQuery()
  const updateInstall = useUpdateAgentWidgetInstall()
  const [framework, setFramework] = useState<WidgetInstallFramework>(DEFAULT_WIDGET_INSTALL.framework)
  const [packageManager, setPackageManager] = useState<WidgetInstallPackageManager>(
    DEFAULT_WIDGET_INSTALL.packageManager
  )
  const [copied, setCopied] = useState<string | null>(null)
  const addToast = useToastStore(toastSelectors.addToast)

  useEffect(() => {
    if (!data) return
    setFramework(data.framework)
    setPackageManager(data.packageManager)
  }, [data])

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      addToast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "error" })
    }
  }

  const scriptSrc = getWidgetCdnUrl() || `${window.location.origin}/widget/agent.js`
  const scriptCode = useMemo(
    () => buildScriptSnippet(agentId, baseUrl, scriptSrc),
    [agentId, baseUrl, scriptSrc]
  )
  const installCode = useMemo(() => buildInstallCommand(packageManager), [packageManager])
  const usageCode = useMemo(
    () =>
      buildUsageSnippet({
        framework,
        agentId,
        baseUrl,
        scriptSrc,
        scriptSnippet: scriptCode
      }),
    [framework, agentId, baseUrl, scriptSrc, scriptCode]
  )
  const showInstall = framework !== "script"

  const handleFrameworkChange = (value: string) => {
    const next = value as WidgetInstallFramework
    if (next === framework) return
    setFramework(next)
    updateInstall.mutate({ framework: next, packageManager })
  }

  const handlePackageManagerChange = (value: string) => {
    const next = value as WidgetInstallPackageManager
    if (next === packageManager) return
    setPackageManager(next)
    updateInstall.mutate({ framework, packageManager: next })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card/70 p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="framework-select">Framework</Label>
            <Select value={framework} onValueChange={handleFrameworkChange}>
              <SelectTrigger id="framework-select" aria-label="Framework">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRAMEWORK_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="package-manager-select">Package manager</Label>
            <Select value={packageManager} onValueChange={handlePackageManagerChange}>
              <SelectTrigger id="package-manager-select" aria-label="Package manager">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PACKAGE_MANAGER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {showInstall ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Install</h4>
          <CodeSnippet
            code={installCode}
            copied={copied === "install"}
            onCopy={() => handleCopy(installCode, "install")}
            testId="install-code"
            buttonTestId="copy-install-button"
          />
        </div>
      ) : null}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Usage</h4>
        <CodeSnippet
          code={usageCode}
          copied={copied === "usage"}
          onCopy={() => handleCopy(usageCode, "usage")}
          testId="usage-code"
          buttonTestId="copy-usage-button"
        />
      </div>

      <div className="text-sm">
        <span className="inline-flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          {framework === "script" ? (
            <span className="text-muted-foreground">
              Paste before the closing{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary">
                {"</body>"}
              </code>{" "}
              tag.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Render this where you want the widget, and conditionally mount/unmount as needed.
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

const getAgentServerBaseUrl = (): string => getApiUrl()

const ConfigureWidgetPanel = () => <ConfigureWidgetPanelContent />

const DEFAULT_CUSTOM_USER_SYSTEM_PROMPT =
  "You are a helpful copilot for this SaaS product. Help users find features, understand workflows, solve problems, and complete tasks. Be concise, friendly, and proactive. If someone seems stuck, suggest the next best step. Avoid technical jargon unless the user is clearly technical. Offer step-by-step guidance when it would help."
const CUSTOM_USER_SYSTEM_PROMPT_MAX_LENGTH = 1500

const normalizeCustomUserSystemPrompt = (value: string) => {
  const normalized = value.replace(/\r\n?/g, "\n").trim()
  return normalized || DEFAULT_CUSTOM_USER_SYSTEM_PROMPT
}

const CustomInstructionsPanel = () => {
  const { data, isPending } = useAgentCustomSystemPromptQuery()
  const updatePrompt = useUpdateAgentCustomSystemPrompt()
  const addToast = useToastStore(toastSelectors.addToast)
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState("")

  useEffect(() => {
    if (!data) return
    setDraft(data.customUserSystemPrompt)
  }, [data])

  const normalizedDraft = useMemo(() => normalizeCustomUserSystemPrompt(draft), [draft])
  const savedValue = useMemo(
    () => normalizeCustomUserSystemPrompt(data?.customUserSystemPrompt ?? DEFAULT_CUSTOM_USER_SYSTEM_PROMPT),
    [data]
  )

  const isDirty = normalizedDraft !== savedValue
  const isCustom = normalizedDraft !== DEFAULT_CUSTOM_USER_SYSTEM_PROMPT

  const handleSave = async () => {
    try {
      await updatePrompt.mutateAsync({ customUserSystemPrompt: draft })
      addToast({ title: "Saved", description: "Custom instructions updated.", variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update custom instructions"
      addToast({ title: "Save failed", description: message, variant: "error" })
    }
  }

  const handleDiscard = () => {
    if (!data) return
    setDraft(data.customUserSystemPrompt)
  }

  const handleRestoreDefaults = () => {
    setDraft(DEFAULT_CUSTOM_USER_SYSTEM_PROMPT)
  }

  if (isPending) {
    return (
      <div
        className="mt-6 rounded-xl border border-border bg-card/70 p-6 shadow-sm"
        data-testid="custom-system-prompt-loading"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-28 w-full" />
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
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Custom Instructions</h3>
                  {isDirty ? (
                    <UnsavedBadge />
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  Define the assistant&apos;s personality, knowledge boundaries, and response style.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={isCustom ? "default" : "secondary"}>
                  {isCustom ? "Custom" : "Default"}
                </Badge>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    aria-label={isOpen ? "Collapse custom instructions" : "Expand custom instructions"}
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="custom-user-system-prompt">Instructions</Label>
                    <span className="text-xs text-muted-foreground">
                      {draft.length}/{CUSTOM_USER_SYSTEM_PROMPT_MAX_LENGTH} characters
                    </span>
                  </div>
                  <Textarea
                    id="custom-user-system-prompt"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={CUSTOM_USER_SYSTEM_PROMPT_MAX_LENGTH}
                    className="min-h-36 font-serif text-[15px] leading-6"
                  />
                </div>

                <DirtyActions
                  onDiscard={handleDiscard}
                  discardDisabled={!isDirty || updatePrompt.isPending}
                  onPrimary={handleSave}
                  primaryDisabled={!isDirty || updatePrompt.isPending}
                  secondaryAction={
                    <Button
                      variant="outline"
                      onClick={handleRestoreDefaults}
                      disabled={updatePrompt.isPending}
                      className="w-full justify-center sm:w-auto"
                    >
                      Restore defaults
                    </Button>
                  }
                />
              </div>
            </CollapsibleContent>
          </div>
        </div>
      </div>
    </Collapsible>
  )
}

const FrontendCapabilityPanel = () => {
  const { data, isPending } = useAgentFrontendCapabilityQuery()
  const updateMutation = useUpdateAgentFrontendCapability()
  const addToast = useToastStore(toastSelectors.addToast)

  const enabled = data?.enabled ?? true

  const handleToggle = async (checked: boolean) => {
    try {
      await updateMutation.mutateAsync({ enabled: checked })
      addToast({
        title: "Saved",
        description: checked ? "Screen autopilot enabled." : "Screen autopilot disabled.",
        variant: "success",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update screen autopilot"
      addToast({ title: "Save failed", description: message, variant: "error" })
    }
  }

  if (isPending) {
    return (
      <div
        className="mt-6 rounded-xl border border-border bg-card/70 p-6 shadow-sm"
        data-testid="frontend-capability-loading"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-6 w-10" />
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-card/70 shadow-sm">
      <div className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Screen Autopilot</h3>
              <Badge variant={enabled ? "default" : "secondary"}>
                {enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Let the agent read page context and complete actions on the page for the user. It can do this directly and does not need to rely on your defined frontend tools.
            </p>
          </div>
          <Switch
            id="screen-autopilot-toggle"
            checked={enabled}
            onCheckedChange={(checked) => void handleToggle(checked)}
            disabled={updateMutation.isPending}
            aria-label="Toggle screen autopilot"
          />
        </div>
      </div>
    </div>
  )
}

const UserRateLimitsPanel = () => {
  const { data, isPending } = useAgentUserRateLimitsQuery()
  const updateMutation = useUpdateAgentUserRateLimits()
  const addToast = useToastStore(toastSelectors.addToast)
  const [isOpen, setIsOpen] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [dailyLimit, setDailyLimit] = useState<string>("")
  const [monthlyLimit, setMonthlyLimit] = useState<string>("")

  useEffect(() => {
    if (!data) return
    setEnabled(data.enabled)
    setDailyLimit(data.dailyLimit?.toString() ?? "")
    setMonthlyLimit(data.monthlyLimit?.toString() ?? "")
  }, [data])

  const isDirty = useMemo(() => {
    if (!data) return false
    const currentDaily = dailyLimit.trim() ? parseInt(dailyLimit, 10) : null
    const currentMonthly = monthlyLimit.trim() ? parseInt(monthlyLimit, 10) : null
    return (
      enabled !== data.enabled ||
      currentDaily !== data.dailyLimit ||
      currentMonthly !== data.monthlyLimit
    )
  }, [data, enabled, dailyLimit, monthlyLimit])

  const handleSave = async () => {
    const daily = dailyLimit.trim() ? parseInt(dailyLimit, 10) : null
    const monthly = monthlyLimit.trim() ? parseInt(monthlyLimit, 10) : null
    if ((daily !== null && (isNaN(daily) || daily < 1)) ||
      (monthly !== null && (isNaN(monthly) || monthly < 1))) {
      addToast({ title: "Invalid limits", description: "Limits must be positive numbers.", variant: "error" })
      return
    }
    try {
      await updateMutation.mutateAsync({
        enabled,
        dailyLimit: daily,
        monthlyLimit: monthly,
      })
      addToast({ title: "Saved", description: "User rate limits updated.", variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update rate limits"
      addToast({ title: "Save failed", description: message, variant: "error" })
    }
  }

  const handleDiscard = () => {
    if (!data) return
    setEnabled(data.enabled)
    setDailyLimit(data.dailyLimit?.toString() ?? "")
    setMonthlyLimit(data.monthlyLimit?.toString() ?? "")
  }

  if (isPending || !data) {
    return (
      <div
        className="mt-6 rounded-xl border border-border bg-card/70 p-6 shadow-sm"
        data-testid="user-rate-limits-loading"
      >
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
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">User Rate Limits</h3>
                  {isDirty ? (
                    <UnsavedBadge />
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">Limit actions per user (by IP)</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={enabled ? "default" : "secondary"}>
                  {enabled ? "Enabled" : "Disabled"}
                </Badge>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    aria-label={isOpen ? "Collapse user rate limits" : "Expand user rate limits"}
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
                      <p className="text-sm font-semibold">Enable rate limiting</p>
                      <p id="rate-limit-description" className="text-sm text-muted-foreground">
                        Limit how many actions each user can perform daily or monthly.
                      </p>
                    </div>
                    <Label htmlFor="rate-limit-toggle" className="sr-only">
                      Enable rate limiting
                    </Label>
                    <Switch
                      id="rate-limit-toggle"
                      checked={enabled}
                      onCheckedChange={setEnabled}
                      aria-describedby="rate-limit-description"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="daily-limit">Daily limit (per user)</Label>
                    <Input
                      id="daily-limit"
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(e.target.value)}
                      disabled={!enabled}
                    />
                    <p className="text-xs text-muted-foreground">Max actions per user per day</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthly-limit">Monthly limit (per user)</Label>
                    <Input
                      id="monthly-limit"
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={monthlyLimit}
                      onChange={(e) => setMonthlyLimit(e.target.value)}
                      disabled={!enabled}
                    />
                    <p className="text-xs text-muted-foreground">Max actions per user per month</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Rate limits are tracked by IP address. When a user exceeds their limit, the widget will hide for them until the limit resets.
                    </p>
                  </div>
                </div>

                <DirtyActions
                  onDiscard={handleDiscard}
                  discardDisabled={!isDirty || updateMutation.isPending}
                  onPrimary={handleSave}
                  primaryDisabled={!isDirty || updateMutation.isPending}
                />
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
  const [isOpen, setIsOpen] = useState(false)
  const apiKeyQuery = useApiKeyQuery(isOpen)
  const deployDraft = useDeployAgentWidgetSecurity()
  const discardDraft = useDiscardAgentWidgetSecurityDraft()
  const setSection = useNavigationStore(navigationSelectors.setSection)
  const addToast = useToastStore(toastSelectors.addToast)

  const active = data?.active
  const draft = data?.draft
  const hasUnsavedChanges = data?.hasStagedChanges ?? false

  const effectiveRequireSignedWidgetToken =
    draft?.requireSignedWidgetToken ?? active?.requireSignedWidgetToken ?? false
  const effectiveWidgetRefreshEndpointPath =
    draft?.widgetRefreshEndpointPath ?? active?.widgetRefreshEndpointPath ?? "/widget-token"
  const showRefreshEndpointUnsaved = Boolean(draft?.widgetRefreshEndpointPath)

  const [widgetRefreshEndpointDraft, setWidgetRefreshEndpointDraft] = useState<string>(
    effectiveWidgetRefreshEndpointPath
  )
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    setWidgetRefreshEndpointDraft(effectiveWidgetRefreshEndpointPath)
  }, [effectiveWidgetRefreshEndpointPath])

  const maskedApiKey = useMemo(() => {
    if (!apiKeyQuery.data?.apiKeyLast4) return null
    return maskApiKey(apiKeyQuery.data.apiKeyLast4)
  }, [apiKeyQuery.data?.apiKeyLast4])

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

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      addToast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "error" })
    }
  }

  const handleDeploy = async () => {
    try {
      await deployDraft.mutateAsync()
      addToast({ title: "Deployed", description: "Advanced Security changes deployed.", variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not deploy changes"
      addToast({ title: "Deploy failed", description: message, variant: "error" })
    }
  }

  const handleDiscard = async () => {
    try {
      await discardDraft.mutateAsync()
      addToast({ title: "Discarded", description: "Unsaved changes discarded.", variant: "success" })
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
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Advanced Security</h3>
                  {hasUnsavedChanges ? (
                    <UnsavedBadge />
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">Optional Widget JWT Auth</p>
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
                  <Label className="text-sm font-semibold">Warpy API Key</Label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="flex-1">
                      {apiKeyQuery.isPending ? (
                        <Skeleton className="h-10 w-full rounded-lg" />
                      ) : (
                        <Input
                          readOnly
                          disabled={!maskedApiKey}
                          value={maskedApiKey ?? ""}
                          placeholder="Open API Config to create the Warpy API key"
                          className="font-mono"
                        />
                      )}
                    </div>
                    <Button type="button" variant="secondary" onClick={() => setSection("api")}>
                      Manage in API Config
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Widget Refresh Endpoint</Label>
                    {showRefreshEndpointUnsaved ? (
                      <UnsavedBadge />
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
                    <li>Store your Warpy API key server-side as an environment variable.</li>
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
                      onClick={() =>
                        void handleCopy(
                          buildWidgetTokenRefreshPrompt(getAgentServerBaseUrl(), effectiveWidgetRefreshEndpointPath),
                          "prompt"
                        )
                      }
                    >
                      <Copy className="h-4 w-4" />
                      {copied === "prompt" ? "Copied" : "Copy prompt for coding agent"}
                    </Button>
                  </div>
                </div>

                <DirtyActions
                  onDiscard={handleDiscard}
                  discardDisabled={!hasUnsavedChanges || discardDraft.isPending}
                  onPrimary={handleDeploy}
                  primaryDisabled={!hasUnsavedChanges || deployDraft.isPending}
                  primaryLabel="Deploy changes"
                />
              </div>
            </CollapsibleContent>
          </div>
        </div>
      </div>
    </Collapsible>
  )
}

export const AgentPanel = () => {
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

  const isPending = isConfigPending || isAgentPending

  if (isPending || isCreating) {
    return (
      <PanelShell title="Activate Agent" description="Install the widget with a script tag or an npm package.">
        <div className="space-y-4" data-testid="agent-panel-loading">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PanelShell>
    )
  }

  const currentBaseUrl = baseUrls[selectedEnv] ?? ""

  return (
    <PanelShell
      title="Activate Agent"
      description="Install the widget with a script tag or an npm package."
      action={environments.length ? (
        <EnvironmentTabs
          environments={environments}
          selected={selectedEnv}
          onSelect={setSelectedEnv}
        />
      ) : null}
    >
      {agent ? (
        <>
          <WidgetInstallDisplay agentId={agent.id} baseUrl={currentBaseUrl} />
          <ConfigureWidgetPanel />
          <CustomInstructionsPanel />
          <FrontendCapabilityPanel />
          <AdvancedSecurityPanel />
          <UserRateLimitsPanel />
        </>
      ) : null}
    </PanelShell>
  )
}
