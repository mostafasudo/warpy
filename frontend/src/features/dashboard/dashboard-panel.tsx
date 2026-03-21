import { type ReactNode } from "react"

import { Activity, ArrowRight, BookOpen, Braces, Link2, MessageCircle, Network, RefreshCw, Sparkles } from "lucide-react"

import { PanelShell } from "@/components/panel-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useActivitySummaryQuery } from "@/queries/use-activity-summary"
import { useAgentQuery } from "@/queries/use-agent"
import { useConfigQuery } from "@/queries/use-config"
import { useFeaturesQuery } from "@/queries/use-features"
import { useKnowledgeBaseStatusQuery } from "@/queries/use-knowledge-base-status"
import { navigationSelectors, useNavigationStore } from "@/stores/navigation"

type OverviewSection = "activity" | "api" | "features" | "knowledge-base" | "agent"
type StepTone = "current" | "done" | "recommended" | "upcoming" | "optional"

type StepCardProps = {
  title: string
  description: string
  tone: StepTone
  icon: ReactNode
}

type SnapshotCardProps = {
  label: string
  value: string
  helper: string
  icon: ReactNode
}

type InsightMetricProps = {
  label: string
  value: string
  helper: string
  icon: ReactNode
}

type OpportunityCardProps = {
  title: string
  description: string
  ctaLabel: string
  onClick: () => void
}

type SectionErrorStateProps = {
  title: string
  description: string
  onRetry: () => void
}

type OverviewAction = {
  label: string
  section: OverviewSection
}

type StatusHeader = {
  eyebrow?: string
  title: string
  description: string
  primaryAction: OverviewAction
}

type ActivityNarrative = {
  title: string
  description: string
}

const agentNotFoundMessage = "Agent not found"

const stepToneLabel: Record<StepTone, string> = {
  current: "Do this next",
  done: "Done",
  recommended: "Recommended",
  upcoming: "Coming up",
  optional: "Optional",
}

const stepToneClasses: Record<StepTone, string> = {
  current: "border-primary/40 bg-primary/5",
  done: "border-border/60 bg-card/70",
  recommended: "border-border/60 bg-muted/20",
  upcoming: "border-dashed border-border/70 bg-muted/10",
  optional: "border-dashed border-border/70 bg-muted/10",
}

const snapshotCard = ({ label, value, helper, icon }: SnapshotCardProps) => (
  <div className="rounded-xl border border-border/60 bg-card/60 p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
    </div>
    <p className="mt-4 text-2xl font-semibold tabular-nums">{value}</p>
  </div>
)

const insightMetric = ({ label, value, helper, icon }: InsightMetricProps) => (
  <div className="rounded-xl border border-border/60 bg-card/60 p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
    </div>
    <p className="mt-4 text-3xl font-semibold tabular-nums">{value}</p>
  </div>
)

const SectionErrorState = ({ title, description, onRetry }: SectionErrorStateProps) => (
  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6" data-testid="overview-section-error">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button type="button" variant="secondary" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  </div>
)

const StepCard = ({ title, description, tone, icon }: StepCardProps) => (
  <div className={`rounded-xl border p-4 ${stepToneClasses[tone]}`} data-testid={`overview-step-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Badge variant={tone === "done" ? "default" : tone === "current" ? "outline" : "secondary"} className="shrink-0 whitespace-nowrap">
        {stepToneLabel[tone]}
      </Badge>
    </div>
  </div>
)

const OpportunityCard = ({ title, description, ctaLabel, onClick }: OpportunityCardProps) => (
  <div className="rounded-xl border border-border/60 bg-card/60 p-4">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="space-y-2">
        <p className="text-sm font-semibold">{title}</p>
        <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
      </div>
      <Button type="button" variant="secondary" onClick={onClick} className="shrink-0 self-start">
        {ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  </div>
)

const getStatusHeader = ({
  hasAgent,
  environmentCount,
  hasAuthorizationHeader,
  featureCount,
  configuredActionCount,
  conversationCount,
  actionCount,
}: {
  hasAgent: boolean
  environmentCount: number
  hasAuthorizationHeader: boolean
  featureCount: number
  configuredActionCount: number
  conversationCount: number
  actionCount: number
}): StatusHeader => {
  if (!hasAgent) {
    return {
      eyebrow: "Start here",
      title: "Set up your agent first",
      description: "Create the agent before you wire environments, headers, and actions. That unlocks the rest of the setup flow.",
      primaryAction: { label: "Open agent", section: "agent" },
    }
  }

  if (environmentCount === 0) {
    return {
      eyebrow: "Setup incomplete",
      title: "Add an environment base URL",
      description: "Your agent exists, but it still needs at least one environment so actions know where to run.",
      primaryAction: { label: "Add environments", section: "api" },
    }
  }

  if (!hasAuthorizationHeader) {
    return {
      eyebrow: "Setup incomplete",
      title: "Add an Authorization header next",
      description: `${environmentCount} environment${environmentCount === 1 ? "" : "s"} ${environmentCount === 1 ? "is" : "are"} ready, but requests still need authorization before the agent can act safely.`,
      primaryAction: { label: "Add authorization header", section: "api" },
    }
  }

  if (featureCount === 0) {
    return {
      eyebrow: "Setup incomplete",
      title: "Add your first feature",
      description: "The agent can connect and authenticate now. Group the actions you want it to run into features next.",
      primaryAction: { label: "Add features", section: "features" },
    }
  }

  if (configuredActionCount === 0) {
    return {
      eyebrow: "Setup incomplete",
      title: "Map actions inside your features",
      description: `You already have ${featureCount} feature${featureCount === 1 ? "" : "s"}, but there are no actions mapped yet, so the agent still cannot do real work.`,
      primaryAction: { label: "Map actions", section: "features" },
    }
  }

  if (conversationCount === 0) {
    return {
      eyebrow: "Ready to go live",
      title: "Your agent is ready for first conversations",
      description: "Core setup is complete. Tune how the agent behaves, then optionally add knowledge sources before sending traffic.",
      primaryAction: { label: "Tune the agent", section: "agent" },
    }
  }

  if (actionCount === 0) {
    return {
      eyebrow: "Usage detected",
      title: "People are chatting, but no actions are running yet",
      description: `${conversationCount.toLocaleString()} conversation${conversationCount === 1 ? "" : "s"} came in during the last 30 days. Expand or enable actions so the agent can do more than answer.`,
      primaryAction: { label: "Open features", section: "features" },
    }
  }

  return {
    title: "Your agent is live",
    description: `In the last 30 days it handled ${conversationCount.toLocaleString()} conversation${conversationCount === 1 ? "" : "s"} and ran ${actionCount.toLocaleString()} action${actionCount === 1 ? "" : "s"}. Review the activity feed and tune what happens next.`,
    primaryAction: { label: "Review activity", section: "activity" },
  }
}

const getActivityNarrative = ({
  coreReady,
  conversationCount,
  actionCount,
}: {
  coreReady: boolean
  conversationCount: number
  actionCount: number
}): ActivityNarrative => {
  if (conversationCount === 0) {
    if (coreReady) {
      return {
        title: "No conversations yet",
        description: "Core setup is complete. Tune the agent, add optional knowledge, and send traffic when you are ready.",
      }
    }
    return {
      title: "No conversations yet",
      description: "Finish the core setup steps first. Once the agent is live, you will start seeing conversations and actions here.",
    }
  }

  if (actionCount === 0) {
    return {
      title: "Conversations are starting, but actions are still missing",
      description: "People are already using the agent. Add or enable more actions so it can do work on their behalf instead of only responding.",
    }
  }

  if (conversationCount < 10) {
    return {
      title: "Early traction is coming in",
      description: "You are starting to see real usage. Check the top actions and tune the agent while behavior is still easy to shape.",
    }
  }

  if (conversationCount < 50) {
    return {
      title: "Usage is building",
      description: "The agent is getting regular conversations. Review the most-used actions and tighten the agent around the flows that matter most.",
    }
  }

  return {
    title: "Strong activity in the last 30 days",
    description: "The agent is doing meaningful work. Use the top actions list to spot your highest-value flows and tune them deliberately.",
  }
}

const getKnowledgeSummary = ({
  enabled,
  documentCount,
  readyDocumentCount,
}: {
  enabled: boolean
  documentCount: number
  readyDocumentCount: number
}) => {
  if (readyDocumentCount > 0) {
    return `${readyDocumentCount} knowledge source${readyDocumentCount === 1 ? "" : "s"} ready for retrieval.`
  }
  if (documentCount > 0) {
    return `${documentCount} knowledge source${documentCount === 1 ? "" : "s"} added and still processing.`
  }
  if (enabled) {
    return "Knowledge base is enabled. Add websites or documents to make it useful."
  }
  return "Optional. Add websites or documents so the agent can answer with your own sources."
}

export const DashboardPanel = () => {
  const configQuery = useConfigQuery()
  const featuresQuery = useFeaturesQuery("")
  const activityQuery = useActivitySummaryQuery()
  const agentQuery = useAgentQuery()
  const knowledgeBaseStatusQuery = useKnowledgeBaseStatusQuery({ refetchInterval: false })
  const setSection = useNavigationStore(navigationSelectors.setSection)

  const config = configQuery.data
  const features = featuresQuery.data ?? []
  const activity = activityQuery.data
  const knowledgeBaseStatus = knowledgeBaseStatusQuery.data

  const isMissingAgent = agentQuery.error instanceof Error && agentQuery.error.message === agentNotFoundMessage
  const hasAgent = Boolean(agentQuery.data)
  const hasSetupError = configQuery.isError || featuresQuery.isError || (agentQuery.isError && !isMissingAgent)
  const isSetupLoading = configQuery.isPending || featuresQuery.isPending || agentQuery.isPending
  const environmentCount = Object.keys(config?.baseUrl ?? {}).length
  const headerEntries = Object.entries(config?.headers ?? {})
  const headerCount = headerEntries.length
  const hasAuthorizationHeader = headerEntries.some(([name]) => name.trim().toLowerCase() === "authorization")
  const featureCount = features.length
  const configuredActionCount = features.reduce((total, feature) => total + feature.toolCount, 0)
  const conversationCount = activity?.conversationCount ?? 0
  const actionCount = activity?.actionCount ?? 0
  const topActions = activity?.topActions ?? []
  const displayedTopActions = topActions.slice(0, 3)
  const displayedTopActionTotal = displayedTopActions.reduce((total, item) => total + item.count, 0)
  const completedCoreSteps =
    Number(hasAgent) +
    Number(environmentCount > 0) +
    Number(hasAuthorizationHeader) +
    Number(featureCount > 0 && configuredActionCount > 0)
  const coreReady =
    hasAgent &&
    environmentCount > 0 &&
    hasAuthorizationHeader &&
    featureCount > 0 &&
    configuredActionCount > 0

  const statusHeader = getStatusHeader({
    hasAgent,
    environmentCount,
    hasAuthorizationHeader,
    featureCount,
    configuredActionCount,
    conversationCount,
    actionCount,
  })

  const activityNarrative = getActivityNarrative({
    coreReady,
    conversationCount,
    actionCount,
  })

  const knowledgeSummary = getKnowledgeSummary({
    enabled: knowledgeBaseStatus?.enabled ?? false,
    documentCount: knowledgeBaseStatus?.documentCount ?? 0,
    readyDocumentCount: knowledgeBaseStatus?.readyDocumentCount ?? 0,
  })
  const showActivityInsightsCta = statusHeader.primaryAction.section !== "activity"

  const setupSteps: StepCardProps[] = [
    {
      title: "Set up the agent",
      description: hasAgent ? "The agent exists and is ready for the rest of the setup flow." : "Create the agent first so everything else has a place to connect.",
      tone: hasAgent ? "done" : "current",
      icon: <Sparkles className="h-5 w-5" />,
    },
    {
      title: "Add environment base URLs",
      description: environmentCount > 0
        ? `${environmentCount} environment${environmentCount === 1 ? "" : "s"} configured.`
        : "Add at least one base URL so the agent knows where actions should run.",
      tone: environmentCount > 0 ? "done" : hasAgent ? "current" : "upcoming",
      icon: <Link2 className="h-5 w-5" />,
    },
    {
      title: "Add headers",
      description: headerCount === 0
        ? "No headers yet. Add Authorization at minimum so requests can authenticate."
        : hasAuthorizationHeader
          ? `${headerCount} header${headerCount === 1 ? "" : "s"} configured, including Authorization.`
          : `${headerCount} header${headerCount === 1 ? "" : "s"} configured, but Authorization is still missing.`,
      tone: hasAuthorizationHeader ? "done" : hasAgent && environmentCount > 0 ? "current" : "upcoming",
      icon: <Braces className="h-5 w-5" />,
    },
    {
      title: "Add features and actions",
      description: featureCount === 0
        ? "Create features first, then map the actions the agent can run inside them."
        : configuredActionCount === 0
          ? `${featureCount} feature${featureCount === 1 ? "" : "s"} added, but no actions are mapped yet.`
          : `${featureCount} feature${featureCount === 1 ? "" : "s"} with ${configuredActionCount} mapped action${configuredActionCount === 1 ? "" : "s"}.`,
      tone: featureCount > 0 && configuredActionCount > 0
        ? "done"
        : hasAgent && environmentCount > 0 && hasAuthorizationHeader
          ? "current"
          : "upcoming",
      icon: <Network className="h-5 w-5" />,
    },
    {
      title: "Configure the agent",
      description: coreReady
        ? conversationCount > 0
          ? "Tune behavior, instructions, and guardrails as you learn from real conversations."
          : "Core setup is complete. Tune behavior before you send traffic."
        : "Once core setup is done, fine-tune how the agent should behave.",
      tone: coreReady ? "recommended" : "upcoming",
      icon: <Sparkles className="h-5 w-5" />,
    },
    {
      title: "Add knowledge sources",
      description: knowledgeSummary,
      tone: knowledgeBaseStatus?.enabled || (knowledgeBaseStatus?.documentCount ?? 0) > 0 ? "done" : coreReady ? "optional" : "upcoming",
      icon: <BookOpen className="h-5 w-5" />,
    },
  ]

  const setupSnapshotCards: SnapshotCardProps[] = [
    {
      label: "Environments",
      value: environmentCount.toLocaleString(),
      helper: environmentCount > 0 ? "Ready for action routing." : "Add at least one base URL.",
      icon: <Link2 className="h-5 w-5" />,
    },
    {
      label: "Headers",
      value: headerCount.toLocaleString(),
      helper: hasAuthorizationHeader
        ? "Authorization is in place."
        : headerCount > 0
          ? "Authorization is still missing."
          : "No headers configured yet.",
      icon: <Braces className="h-5 w-5" />,
    },
    {
      label: "Features",
      value: featureCount.toLocaleString(),
      helper: featureCount > 0 ? "Feature groups are defined." : "Create the flows you want the agent to handle.",
      icon: <Network className="h-5 w-5" />,
    },
    {
      label: "Mapped actions",
      value: configuredActionCount.toLocaleString(),
      helper: configuredActionCount > 0 ? "Real actions are available." : "Add actions inside your features next.",
      icon: <Activity className="h-5 w-5" />,
    },
  ]

  const opportunities: OpportunityCardProps[] = [
    {
      title: "Tune the agent",
      description: conversationCount > 0
        ? "Use real conversations to sharpen instructions, safety, and behavior."
        : "Core setup is done. Tune the agent before you send more traffic.",
      ctaLabel: "Open agent",
      onClick: () => setSection("agent"),
    },
    {
      title: "Expand knowledge",
      description: knowledgeSummary,
      ctaLabel: "Open knowledge base",
      onClick: () => setSection("knowledge-base"),
    },
    {
      title: "Review activity",
      description: conversationCount > 0
        ? "Open the full activity view to inspect recent conversations and actions."
        : "When conversations start coming in, this is where you will inspect them.",
      ctaLabel: "View activity",
      onClick: () => setSection("activity"),
    },
  ]

  return (
    <PanelShell
      title="Overview"
      description="See what your agent should do next and how people are using it."
    >
      <div className="mx-auto max-w-[1540px] space-y-6" data-testid="overview-panel">
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-6" data-testid="overview-status-header">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_auto] xl:items-start">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {statusHeader.eyebrow ? <Badge variant={coreReady ? "default" : "secondary"}>{statusHeader.eyebrow}</Badge> : null}
                {!coreReady ? <Badge variant="outline">{completedCoreSteps}/4 core steps complete</Badge> : null}
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold tracking-tight">{statusHeader.title}</h3>
                <p className="max-w-3xl text-sm text-muted-foreground">{statusHeader.description}</p>
              </div>
            </div>
            <div className="flex items-start xl:justify-end">
              <Button type="button" onClick={() => setSection(statusHeader.primaryAction.section)} className="shrink-0">
                {statusHeader.primaryAction.label}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {!coreReady ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section className="space-y-4 rounded-2xl border border-border/70 bg-muted/10 p-5" data-testid="overview-guided-setup">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Guided setup
                </div>
                <p className="text-sm text-muted-foreground">
                  Follow the default flow so the agent can run real actions safely and predictably.
                </p>
              </div>
              {isSetupLoading ? (
                <div className="space-y-3" data-testid="overview-setup-loading">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={`setup-step-${index}`} className="h-24 w-full rounded-xl" />
                  ))}
                </div>
              ) : hasSetupError ? (
                <SectionErrorState
                  title="Could not load setup progress"
                  description="Retry to load the current agent, environments, headers, and features."
                  onRetry={() => {
                    void agentQuery.refetch()
                    void configQuery.refetch()
                    void featuresQuery.refetch()
                  }}
                />
              ) : (
                <div className="space-y-3">
                  {setupSteps.map((step) => (
                    <StepCard key={step.title} {...step} />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-2xl border border-border/70 bg-muted/10 p-5" data-testid="overview-setup-snapshot">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="h-4 w-4 text-primary" />
                  Setup snapshot
                </div>
                <p className="text-sm text-muted-foreground">
                  The counts below tell you how close the current setup is to being usable.
                </p>
              </div>
              {isSetupLoading ? (
                <div className="grid gap-3 sm:grid-cols-2" data-testid="overview-snapshot-loading">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={`snapshot-${index}`} className="h-32 w-full rounded-xl" />
                  ))}
                </div>
              ) : hasSetupError ? (
                <SectionErrorState
                  title="Setup details are unavailable"
                  description="The rest of the overview can still load, but this part needs a retry."
                  onRetry={() => {
                    void agentQuery.refetch()
                    void configQuery.refetch()
                    void featuresQuery.refetch()
                  }}
                />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {setupSnapshotCards.map((card) => (
                      <div key={card.label}>{snapshotCard(card)}</div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-4" data-testid="overview-knowledge-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Knowledge base</p>
                        <p className="text-sm text-muted-foreground">
                          {knowledgeBaseStatusQuery.isError
                            ? "Knowledge base status is unavailable right now."
                            : knowledgeBaseStatusQuery.isPending
                              ? "Loading knowledge base status..."
                              : knowledgeSummary}
                        </p>
                      </div>
                      <BookOpen className="mt-1 h-5 w-5 text-primary" />
                    </div>
                    <Button type="button" variant="secondary" className="mt-4 self-start" onClick={() => setSection("knowledge-base")}>
                      Open knowledge base
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </section>
          </div>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-border/70 bg-muted/10 p-5" data-testid="overview-usage-insights">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MessageCircle className="h-4 w-4 text-primary" />
                Usage insights
              </div>
              <p className="text-sm text-muted-foreground">
                Conversations and actions from the last 30 days, with the top actions people use most.
              </p>
            </div>
            {showActivityInsightsCta ? (
              <Button type="button" variant="secondary" onClick={() => setSection("activity")} className="self-start md:self-auto">
                View all activity
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          {activityQuery.isPending ? (
            <div className="space-y-4" data-testid="overview-usage-loading">
              <div className="grid gap-3 md:grid-cols-2">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : activityQuery.isError ? (
            <SectionErrorState
              title="Could not load usage insights"
              description="Retry to load the last 30 days of conversations and actions."
              onRetry={() => {
                void activityQuery.refetch()
              }}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.8fr)]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>{insightMetric({ label: "Conversations", value: conversationCount.toLocaleString(), helper: "Last 30 days.", icon: <MessageCircle className="h-5 w-5" /> })}</div>
                  <div>{insightMetric({ label: "Actions", value: actionCount.toLocaleString(), helper: "Last 30 days.", icon: <Activity className="h-5 w-5" /> })}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/60 p-4" data-testid="overview-activity-narrative">
                  <p className="text-sm font-semibold">{activityNarrative.title}</p>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{activityNarrative.description}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/60 p-4" data-testid="overview-top-actions">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Top actions</p>
                  <p className="text-sm text-muted-foreground">
                    The actions people ask the widget to run most often. Bars compare the actions shown here.
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {displayedTopActions.length ? (
                    displayedTopActions.map((item, index) => (
                      <div
                        key={`${item.feature}-${item.action}`}
                        className="grid gap-3 rounded-lg border border-border/50 bg-muted/10 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {(index + 1).toString().padStart(2, "0")}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.action}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.feature || "Unassigned feature"}</p>
                        </div>
                        <div className="flex items-center gap-3 sm:justify-end">
                          <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
                            <div
                              className="h-full rounded-full bg-primary/70"
                              style={{ width: `${displayedTopActionTotal > 0 ? (item.count / displayedTopActionTotal) * 100 : 0}%` }}
                            />
                          </div>
                          <p className="min-w-10 text-right text-sm font-medium tabular-nums text-muted-foreground">
                            {item.count.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {conversationCount > 0
                        ? "Conversations are happening, but no action runs have been recorded in the last 30 days."
                        : "No actions yet. They will show up here once people start using the agent."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {coreReady ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className="space-y-4 rounded-2xl border border-border/70 bg-muted/10 p-5" data-testid="overview-opportunities">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Keep improving
                </div>
                <p className="text-sm text-muted-foreground">
                  Core setup is complete. These are the best next moves based on the current account state.
                </p>
              </div>
              <div className="space-y-3">
                {opportunities.map((item) => (
                  <OpportunityCard key={item.title} {...item} />
                ))}
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-border/70 bg-muted/10 p-5" data-testid="overview-readiness-strip">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="h-4 w-4 text-primary" />
                  Readiness strip
                </div>
                <p className="text-sm text-muted-foreground">
                  Keep the core setup visible while usage becomes the main story.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {setupSnapshotCards.map((card) => (
                  <div key={card.label}>{snapshotCard(card)}</div>
                ))}
              </div>
              <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-4">
                <p className="text-sm font-semibold">Knowledge base</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {knowledgeBaseStatusQuery.isError
                    ? "Knowledge base status is unavailable right now."
                    : knowledgeBaseStatusQuery.isPending
                      ? "Loading knowledge base status..."
                      : knowledgeSummary}
                </p>
              </div>
            </section>
          </div>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-dashed border-border/70 bg-muted/10 p-5" data-testid="overview-secondary-navigation">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              Quick access
            </div>
            <p className="text-sm text-muted-foreground">
              Jump straight to the area you want to work on next.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setSection("api")}>API config</Button>
            <Button type="button" variant="secondary" onClick={() => setSection("features")}>Features</Button>
            <Button type="button" variant="secondary" onClick={() => setSection("agent")}>Agent</Button>
            <Button type="button" variant="secondary" onClick={() => setSection("knowledge-base")}>Knowledge base</Button>
            <Button type="button" variant="secondary" onClick={() => setSection("activity")}>User activity</Button>
          </div>
        </section>
      </div>
    </PanelShell>
  )
}
