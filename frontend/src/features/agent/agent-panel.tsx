import { useEffect, useState } from "react"
import { Check, Copy, Info, Link2, Sparkles } from "lucide-react"
import clsx from "clsx"

import { PanelShell } from "@/components/panel-shell"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAgentQuery } from "@/queries/use-agent"
import { useConfigQuery } from "@/queries/use-config"
import { useEndpointsQuery } from "@/queries/use-endpoints"
import { useCreateAgent } from "@/mutations/use-create-agent"
import { navigationSelectors, useNavigationStore } from "@/stores/navigation"

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
        need you to define your endpoints in the Endpoints tab.
      </p>
      <Button onClick={() => setSection("endpoints")}>
        <Link2 className="mr-2 h-4 w-4" />
        Configure Endpoints
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

  const scriptSrc = getWidgetCdnUrl() || `${window.location.origin}/widget/agent.js`
  const scriptCode = `<script src="${scriptSrc}"
        data-agent-id="${agentId}"
        data-base-url="${baseUrl}"></script>`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(scriptCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

export const AgentPanel = () => {
  const { data: endpoints, isPending: isEndpointsPending } = useEndpointsQuery(1, 1, "")
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

  const isPending = isEndpointsPending || isConfigPending || isAgentPending
  const hasEndpoints = (endpoints?.total ?? 0) > 0

  if (isPending || isCreating) {
    return (
      <PanelShell title="Activate Agent" description="Install the script to enable your agent to perform actions on behalf of your users.">
        <div className="space-y-4">
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
      {agent && <ScriptDisplay agentId={agent.id} baseUrl={currentBaseUrl} />}
    </PanelShell>
  )
}


