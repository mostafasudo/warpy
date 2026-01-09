import { type ReactNode } from "react"

import { Activity, ArrowRight, Braces, Link2, Network, Sparkles } from "lucide-react"

import { PanelShell } from "@/components/panel-shell"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useActivitySummaryQuery } from "@/queries/use-activity-summary"
import { useConfigQuery } from "@/queries/use-config"
import { useFeaturesQuery } from "@/queries/use-features"
import { navigationSelectors, useNavigationStore } from "@/stores/navigation"

type StatCardProps = {
  label: string
  helper: string
  icon: ReactNode
  value: number
  loading: boolean
}

const StatCard = ({ label, helper, icon, value, loading }: StatCardProps) => (
  <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </div>
    </div>
    <div className="text-3xl font-semibold tabular-nums">
      {loading ? <Skeleton className="h-8 w-16" /> : value}
    </div>
  </div>
)

export const DashboardPanel = () => {
  const { data: config, isPending: isConfigPending } = useConfigQuery()
  const { data: features, isPending: isFeaturesPending } = useFeaturesQuery("")
  const { data: activity, isPending: isActivityPending } = useActivitySummaryQuery()
  const setSection = useNavigationStore(navigationSelectors.setSection)

  const environmentCount = Object.keys(config?.baseUrl ?? {}).length
  const headerCount = Object.keys(config?.headers ?? {}).length
  const featureCount = features?.length ?? 0
  const endpointCount = (features ?? []).reduce((total, feature) => total + (feature?.endpointCount ?? 0), 0)
  const endpointHelper = `${endpointCount} endpoint${endpointCount === 1 ? "" : "s"} mapped.`

	  return (
	    <PanelShell
	      title="Overview"
	      description="See what your agent can use right now."
	    >
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Features"
          helper={endpointHelper}
          icon={<Network className="h-5 w-5" />}
          value={featureCount}
          loading={isFeaturesPending}
        />
        <StatCard
          label="Environments"
          helper="Environments your agent can run in."
          icon={<Link2 className="h-5 w-5" />}
          value={environmentCount}
          loading={isConfigPending}
        />
        <StatCard
          label="Session headers"
          helper="Headers sent with each request."
          icon={<Braces className="h-5 w-5" />}
          value={headerCount}
          loading={isConfigPending}
        />
      </div>
      <div className="mt-6 rounded-xl border border-border/60 bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-primary" />
            User activity
          </div>
          <Button type="button" variant="secondary" onClick={() => setSection("activity")}>
            View all
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card/70 p-4">
            <p className="text-sm font-medium">Conversations</p>
            <p className="mt-1 text-xs text-muted-foreground">Last 30 days.</p>
            <div className="mt-3 text-3xl font-semibold tabular-nums">
              {isActivityPending ? <Skeleton className="h-8 w-20" /> : (activity?.conversationCount ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/70 p-4">
            <p className="text-sm font-medium">Top actions</p>
            <p className="mt-1 text-xs text-muted-foreground">What people ask the widget to do most.</p>
            <div className="mt-3 space-y-2">
              {isActivityPending ? (
                <Skeleton className="h-6 w-full" />
              ) : (activity?.topActions?.length ?? 0) ? (
                activity?.topActions.slice(0, 3).map((item) => (
                  <div key={`${item.feature}-${item.action}`} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.action}</p>
                      {item.feature ? <p className="truncate text-xs text-muted-foreground">{item.feature}</p> : null}
                    </div>
                    <p className="tabular-nums text-muted-foreground">{item.count.toLocaleString()}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No actions yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 space-y-3 rounded-xl border border-dashed border-border/70 bg-muted/20 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          Next steps
        </div>
        <p className="text-sm text-muted-foreground">
          Jump into the area you want to configure next.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => setSection("api")}
            variant="secondary"
            className="justify-between"
          >
            Configure API
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => setSection("features")} variant="secondary" className="justify-between">
            Go to features
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => setSection("agent")} variant="secondary" className="justify-between">
            Go to agent
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </PanelShell>
  )
}
