import { type ReactNode } from "react"

import { ArrowRight, Braces, Link2, Network, Sparkles } from "lucide-react"

import { PanelShell } from "@/components/panel-shell"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
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
  const setSection = useNavigationStore(navigationSelectors.setSection)

  const environmentCount = Object.keys(config?.baseUrl ?? {}).length
  const headerCount = Object.keys(config?.headers ?? {}).length
  const featureCount = features?.length ?? 0
  const endpointCount = (features ?? []).reduce((total, feature) => total + (feature?.endpointCount ?? 0), 0)
  const endpointHelper = `${endpointCount} endpoint${endpointCount === 1 ? "" : "s"} mapped.`

  return (
    <PanelShell
      title="Dashboard"
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
            className="justify-between bg-muted/60 hover:bg-muted"
          >
            Configure API
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => setSection("features")} className="justify-between">
            Go to features
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </PanelShell>
  )
}
