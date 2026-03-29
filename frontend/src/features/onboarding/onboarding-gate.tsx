import { useQueryClient } from "@tanstack/react-query"
import { Copy, Globe, KeyRound, Link2, LoaderCircle, Sparkles } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { buildScriptSnippet, getWidgetCdnUrl, normalizeCustomerBaseUrl } from "@/lib/widget-install"
import { useAddOnboardingWebsite } from "@/mutations/use-add-onboarding-website"
import { useCreateAgent } from "@/mutations/use-create-agent"
import { useFinalizeOnboarding } from "@/mutations/use-finalize-onboarding"
import { useStartOnboarding } from "@/mutations/use-start-onboarding"
import { agentQueryKey, useAgentQuery } from "@/queries/use-agent"
import { useConfigQuery } from "@/queries/use-config"
import { useKnowledgeWebsitesQuery } from "@/queries/use-knowledge-websites"
import { onboardingStateQueryKey } from "@/queries/use-onboarding-state"
import { useSaveConfig } from "@/queries/use-save-config"
import { toastSelectors, useToastStore } from "@/stores/toast"
import type { AuthConfig, AuthStorageSource, AuthorizationType, ConfigResponse, OnboardingStateResponse } from "@/types"

type OnboardingGateProps = {
  state: OnboardingStateResponse
  onContinueToDashboard: () => void
}

type OnboardingStep = OnboardingStateResponse["nextStep"]

const stepOrder: OnboardingStep[] = ["website", "baseUrl", "auth", "agent"]

const stepMeta: Record<OnboardingStep, { label: string; title: string; description: string; icon: typeof Globe }> = {
  website: {
    label: "Website",
    title: "Welcome to Warpy, let's get started.",
    description: "Tell us where your product lives so we can start reading it for your agent.",
    icon: Globe
  },
  baseUrl: {
    label: "API",
    title: "Where should the agent send API requests?",
    description: "Add your API base URL so action calls know where to run.",
    icon: Link2
  },
  auth: {
    label: "Auth",
    title: "How should requests authenticate in your app?",
    description: "Choose the auth methods your API expects.",
    icon: KeyRound
  },
  agent: {
    label: "Agent",
    title: "Here's your agent.",
    description: "Paste this script into your dashboard to let users ask for help and run real actions.",
    icon: Sparkles
  }
}

const getPreviousStep = (step: OnboardingStep): OnboardingStep => {
  const index = stepOrder.indexOf(step)
  return stepOrder[Math.max(index - 1, 0)]
}

const getNextStep = (step: OnboardingStep): OnboardingStep => {
  const index = stepOrder.indexOf(step)
  return stepOrder[Math.min(index + 1, stepOrder.length - 1)]
}

const getWebsiteHost = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`
  try {
    return new URL(candidate).hostname
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/.*$/, "")
  }
}

const buildApiPlaceholder = (websiteValue: string) => {
  const host = getWebsiteHost(websiteValue)
  if (!host) return "api.your-product.com"
  return `api.${host}`
}

const buildConfigPayload = (config: ConfigResponse | undefined, overrides: Partial<ConfigResponse>): ConfigResponse => ({
  baseUrl: {
    local: config?.baseUrl.local ?? "",
    production: config?.baseUrl.production ?? "",
    ...config?.baseUrl,
    ...overrides.baseUrl
  },
  auth: overrides.auth ?? config?.auth ?? { mode: "none" },
  sendCookiesWithRequests: overrides.sendCookiesWithRequests ?? config?.sendCookiesWithRequests ?? false,
  headers: overrides.headers ?? (config?.headers ?? {})
})

const normalizeAuth = (
  config: ConfigResponse | undefined
): {
  auth: { mode: "none"; source: AuthStorageSource; key: string; authType: AuthorizationType } | { mode: "header"; source: AuthStorageSource; key: string; authType: AuthorizationType }
  sendCookiesWithRequests: boolean
} => {
  if (config?.auth?.mode === "header") {
    return {
      auth: {
        mode: "header",
        source: config.auth.source ?? "localStorage",
        key: config.auth.key ?? "",
        authType: config.auth.authType ?? "bearer"
      },
      sendCookiesWithRequests: Boolean(
        config.sendCookiesWithRequests || (config.auth as { mode?: string } | undefined)?.mode === "browserCookies"
      )
    }
  }
  return {
    auth: {
      mode: "none",
      source: "localStorage",
      key: "",
      authType: "bearer"
    },
    sendCookiesWithRequests: Boolean(
      config?.sendCookiesWithRequests || (config?.auth as { mode?: string } | undefined)?.mode === "browserCookies"
    )
  }
}

const StepCard = ({
  step,
  activeStep,
  completed
}: {
  step: OnboardingStep
  activeStep: OnboardingStep
  completed: boolean
}) => {
  const meta = stepMeta[step]
  const Icon = meta.icon
  const isActive = step === activeStep

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        isActive ? "border-primary/40 bg-primary/5" : completed ? "border-border/70 bg-card/60" : "border-border/60 bg-muted/15"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isActive ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-sm font-medium">{meta.label}</p>
      </div>
    </div>
  )
}

const ScriptSnippet = ({
  code,
  onCopy,
  copied
}: {
  code: string
  onCopy: () => void
  copied: boolean
}) => (
  <div className="relative overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/85">
    <pre className="overflow-x-auto p-5 pr-24 text-sm leading-relaxed text-foreground">
      <code>{code}</code>
    </pre>
    <Button type="button" size="sm" variant="outline" className="absolute right-4 top-4" onClick={onCopy}>
      <Copy className="mr-2 h-4 w-4" />
      {copied ? "Copied" : "Copy"}
    </Button>
  </div>
)

export const OnboardingGate = ({ state, onContinueToDashboard }: OnboardingGateProps) => {
  const queryClient = useQueryClient()
  const addToast = useToastStore(toastSelectors.addToast)
  const configQuery = useConfigQuery()
  const websitesQuery = useKnowledgeWebsitesQuery()
  const agentQuery = useAgentQuery()
  const startOnboarding = useStartOnboarding()
  const addOnboardingWebsite = useAddOnboardingWebsite()
  const createAgent = useCreateAgent()
  const finalizeOnboarding = useFinalizeOnboarding()
  const saveConfig = useSaveConfig()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(state.nextStep)
  const [websiteInput, setWebsiteInput] = useState("")
  const [baseUrlInput, setBaseUrlInput] = useState("")
  const [authType, setAuthType] = useState<AuthorizationType>("bearer")
  const [storageSource, setStorageSource] = useState<AuthStorageSource>("localStorage")
  const [tokenKey, setTokenKey] = useState("")
  const [authorizationEnabled, setAuthorizationEnabled] = useState(false)
  const [sendCookiesWithRequests, setSendCookiesWithRequests] = useState(false)
  const [copied, setCopied] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)
  const hasStartedRef = useRef(false)
  const hasAutoCreateAgentAttemptRef = useRef(false)
  const hasHydratedWebsiteRef = useRef(false)
  const hasHydratedBaseUrlRef = useRef(false)
  const hasHydratedAuthRef = useRef(false)

  const primaryWebsite = websitesQuery.data?.items?.[0] ?? null
  const productionBaseUrl = configQuery.data?.baseUrl.production ?? ""
  const effectiveAgent = agentQuery.data ?? null
  const scriptSrc = getWidgetCdnUrl() || `${window.location.origin}/widget/agent.js`
  const scriptSnippet = useMemo(
    () => (effectiveAgent ? buildScriptSnippet(effectiveAgent.id, productionBaseUrl, scriptSrc) : ""),
    [effectiveAgent, productionBaseUrl, scriptSrc]
  )

  useEffect(() => {
    setCurrentStep((previousStep) => (
      stepOrder.indexOf(previousStep) < stepOrder.indexOf(state.nextStep)
        ? state.nextStep
        : previousStep
    ))
  }, [state.nextStep])

  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true
    startOnboarding.mutate()
  }, [startOnboarding])

  useEffect(() => {
    if (hasHydratedWebsiteRef.current || !primaryWebsite?.inputUrl) return
    hasHydratedWebsiteRef.current = true
    setWebsiteInput(primaryWebsite.inputUrl)
  }, [primaryWebsite?.inputUrl])

  useEffect(() => {
    if (hasHydratedBaseUrlRef.current || !productionBaseUrl) return
    hasHydratedBaseUrlRef.current = true
    setBaseUrlInput(productionBaseUrl)
  }, [productionBaseUrl])

  useEffect(() => {
    if (hasHydratedAuthRef.current || !configQuery.data) return
    hasHydratedAuthRef.current = true
    const normalized = normalizeAuth(configQuery.data)
    setAuthorizationEnabled(normalized.auth.mode === "header")
    setTokenKey(normalized.auth.key)
    setStorageSource(normalized.auth.source)
    setAuthType(normalized.auth.authType)
    setSendCookiesWithRequests(normalized.sendCookiesWithRequests)
  }, [configQuery.data])

  useEffect(() => {
    if (currentStep !== "agent") {
      hasAutoCreateAgentAttemptRef.current = false
      return
    }
    if (
      agentQuery.isPending ||
      effectiveAgent ||
      createAgent.isPending ||
      hasAutoCreateAgentAttemptRef.current
    ) {
      return
    }
    hasAutoCreateAgentAttemptRef.current = true
    setAgentError(null)
    createAgent.mutate(undefined, {
      onError: (error) => {
        const message = error instanceof Error ? error.message : "Could not create your agent."
        if (message === "Agent already exists") {
          hasAutoCreateAgentAttemptRef.current = false
          void queryClient.invalidateQueries({ queryKey: agentQueryKey })
          return
        }
        setAgentError(message)
      }
    })
  }, [agentQuery.isPending, createAgent, currentStep, effectiveAgent, queryClient])

  const completedIndex = stepOrder.indexOf(currentStep)
  const activeMeta = stepMeta[currentStep]
  const ActiveIcon = activeMeta.icon
  const baseUrlPlaceholder = buildApiPlaceholder(websiteInput || primaryWebsite?.inputUrl || "")
  const canContinueWebsite = Boolean(websiteInput.trim()) && !addOnboardingWebsite.isPending
  const canContinueBaseUrl = Boolean(baseUrlInput.trim()) && !saveConfig.isPending && !configQuery.isPending
  const canContinueAuth =
    (sendCookiesWithRequests || (authorizationEnabled && Boolean(tokenKey.trim()))) &&
    !saveConfig.isPending &&
    !configQuery.isPending
  const isPreparingAgent = currentStep === "agent" && !effectiveAgent && (agentQuery.isPending || createAgent.isPending || !agentError)

  const handleWebsiteContinue = async () => {
    try {
      const website = await addOnboardingWebsite.mutateAsync({ url: websiteInput.trim() })
      setWebsiteInput(website.inputUrl)
      setCurrentStep("baseUrl")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your website."
      addToast({ title: "Website failed", description: message, variant: "error" })
    }
  }

  const handleBaseUrlContinue = async () => {
    const normalizedBaseUrl = normalizeCustomerBaseUrl(baseUrlInput)
    try {
      await saveConfig.mutateAsync(
        buildConfigPayload(configQuery.data, {
          baseUrl: { production: normalizedBaseUrl }
        })
      )
      setBaseUrlInput(normalizedBaseUrl)
      setCurrentStep("auth")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your API base URL."
      addToast({ title: "Save failed", description: message, variant: "error" })
    }
  }

  const handleAuthContinue = async () => {
    const authPayload: AuthConfig = !authorizationEnabled || !tokenKey.trim()
      ? { mode: "none" }
      : {
          mode: "header",
          source: storageSource,
          key: tokenKey.trim(),
          authType
        }

    try {
      await saveConfig.mutateAsync(
        buildConfigPayload(configQuery.data, {
          auth: authPayload,
          sendCookiesWithRequests
        })
      )
      setCurrentStep("agent")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your auth settings."
      addToast({ title: "Save failed", description: message, variant: "error" })
    }
  }

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(scriptSnippet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      addToast({ title: "Copy failed", description: "Could not copy the script tag.", variant: "error" })
    }
  }

  const renderStepBody = () => {
    if (currentStep === "website") {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="onboarding-website">Product website</Label>
            <Input
              id="onboarding-website"
              value={websiteInput}
              onChange={(event) => setWebsiteInput(event.target.value)}
              placeholder="your-product.com"
              autoFocus
              data-testid="onboarding-website-input"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            We’ll add this website to your knowledge base and start ingesting it in the background.
          </p>
        </div>
      )
    }

    if (currentStep === "baseUrl") {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="onboarding-api-base-url">API base URL</Label>
            <Input
              id="onboarding-api-base-url"
              value={baseUrlInput}
              onChange={(event) => setBaseUrlInput(event.target.value)}
              placeholder={baseUrlPlaceholder}
              autoFocus
              data-testid="onboarding-base-url-input"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            If you enter a host only, we’ll save it as an HTTPS URL automatically.
          </p>
        </div>
      )
    }

    if (currentStep === "auth") {
      return (
        <div className="space-y-4">
          <section className="rounded-xl border border-border/70 bg-background/70 p-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="pr-4 text-sm font-semibold">Send Authorization header</h3>
              <Switch
                id="onboarding-auth-header-switch"
                checked={authorizationEnabled}
                onCheckedChange={setAuthorizationEnabled}
                data-testid="onboarding-auth-header-switch"
              />
            </div>

            {authorizationEnabled ? (
              <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={authType} onValueChange={(value) => setAuthType(value as AuthorizationType)}>
                    <SelectTrigger data-testid="onboarding-auth-type-trigger">
                      <SelectValue placeholder="Select auth type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bearer">Bearer</SelectItem>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="none">No prefix</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Storage</Label>
                  <Select value={storageSource} onValueChange={(value) => setStorageSource(value as AuthStorageSource)}>
                    <SelectTrigger data-testid="onboarding-storage-trigger">
                      <SelectValue placeholder="Select token location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="localStorage">Local storage</SelectItem>
                      <SelectItem value="sessionStorage">Session storage</SelectItem>
                      <SelectItem value="cookies">Cookies</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onboarding-token-key">Key</Label>
                  <Input
                    id="onboarding-token-key"
                    value={tokenKey}
                    onChange={(event) => setTokenKey(event.target.value)}
                    placeholder="authorization"
                    autoFocus
                    data-testid="onboarding-token-key-input"
                  />
                </div>
              </div>
            ) : null}
          </section>
          <section className="rounded-xl border border-border/70 bg-background/70 p-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="pr-4 text-sm font-semibold">Include cookies on requests</h3>
              <Switch
                id="onboarding-send-cookies-switch"
                checked={sendCookiesWithRequests}
                onCheckedChange={setSendCookiesWithRequests}
                data-testid="onboarding-send-cookies-switch"
              />
            </div>
          </section>
        </div>
      )
    }

    return (
      <div className="space-y-5">
        {effectiveAgent ? (
          <>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Paste this into your dashboard, then continue to keep configuring your features, tools, and agent.
              </p>
              <ScriptSnippet code={scriptSnippet} onCopy={handleCopySnippet} copied={copied} />
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              {productionBaseUrl
                ? `Requests will use ${normalizeCustomerBaseUrl(productionBaseUrl)} as the customer API base URL.`
                : "You can add the API base URL later from API config. The script tag will still work without it."}
            </div>
          </>
        ) : (
          <div className="rounded-[1.5rem] border border-border/70 bg-muted/15 p-6">
            {isPreparingAgent ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground" data-testid="onboarding-agent-loading">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Creating your agent…
              </div>
            ) : (
              <div className="space-y-4" data-testid="onboarding-agent-error">
                <p className="text-sm text-muted-foreground">{agentError ?? "We could not create your agent right now."}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAgentError(null)
                    createAgent.mutate(undefined, {
                      onError: (error) => {
                        const message = error instanceof Error ? error.message : "Could not create your agent."
                        if (message === "Agent already exists") {
                          void queryClient.invalidateQueries({ queryKey: agentQueryKey })
                          return
                        }
                        setAgentError(message)
                      }
                    })
                  }}
                >
                  Retry
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const handleContinue = async () => {
    if (currentStep === "website") {
      await handleWebsiteContinue()
      return
    }
    if (currentStep === "baseUrl") {
      await handleBaseUrlContinue()
      return
    }
    if (currentStep === "auth") {
      await handleAuthContinue()
      return
    }
    try {
      await finalizeOnboarding.mutateAsync()
      await queryClient.invalidateQueries({ queryKey: onboardingStateQueryKey })
      onContinueToDashboard()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not finish onboarding."
      addToast({ title: "Finish failed", description: message, variant: "error" })
    }
  }

  const isContinueDisabled =
    currentStep === "website"
      ? !canContinueWebsite
      : currentStep === "baseUrl"
        ? !canContinueBaseUrl
        : currentStep === "auth"
          ? !canContinueAuth
          : !effectiveAgent || finalizeOnboarding.isPending

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-6 sm:px-6 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.14),_transparent_38%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--background))_48%,_hsl(var(--muted)/0.32))]" />
        <div className="absolute -left-16 top-24 h-64 w-64 rounded-full bg-secondary/25 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      </div>
      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col justify-center">
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-[2rem] border border-border/70 bg-card/75 p-5 shadow-sm backdrop-blur">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Setup</p>
              <h2 className="text-xl font-semibold">From signup to usable in minutes</h2>
            </div>
            <div className="mt-6 space-y-3">
              {stepOrder.map((step, index) => (
                <StepCard
                  key={step}
                  step={step}
                  activeStep={currentStep}
                  completed={index < completedIndex || (step === "agent" && Boolean(effectiveAgent))}
                />
              ))}
            </div>
          </aside>

          <section className="rounded-[2rem] border border-border/70 bg-card/80 p-6 shadow-xl backdrop-blur sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <ActiveIcon className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{activeMeta.title}</h1>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{activeMeta.description}</p>
              </div>
            </div>

            <div className="mt-8 rounded-[1.75rem] border border-border/70 bg-background/70 p-6 sm:p-8">
              {renderStepBody()}
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-border/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCurrentStep(getPreviousStep(currentStep))}
                disabled={currentStep === "website" || addOnboardingWebsite.isPending || saveConfig.isPending || createAgent.isPending || finalizeOnboarding.isPending}
              >
                Back
              </Button>
              <div className="flex flex-col gap-3 sm:flex-row">
                {currentStep !== "agent" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCurrentStep(getNextStep(currentStep))
                    }}
                    disabled={addOnboardingWebsite.isPending || saveConfig.isPending || createAgent.isPending || finalizeOnboarding.isPending}
                  >
                    Skip
                  </Button>
                ) : null}
                <Button type="button" onClick={handleContinue} disabled={isContinueDisabled}>
                  {currentStep === "agent" ? "Continue to dashboard" : "Continue"}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
