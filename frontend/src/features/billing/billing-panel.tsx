import { type ReactNode } from "react"

import { CreditCard, Sparkles } from "lucide-react"

import { PanelShell } from "@/components/panel-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCreateSubscriptionCheckout } from "@/mutations/use-create-subscription-checkout"
import { useCreateTopupCheckout } from "@/mutations/use-create-topup-checkout"
import { useOpenBillingPortal } from "@/mutations/use-open-billing-portal"
import { useBillingSummaryQuery } from "@/queries/use-billing-summary"
import { cn } from "@/lib/utils"
import { toastSelectors, useToastStore } from "@/stores/toast"
import type { BillingPlan } from "@/types"

export const navigateToUrl = (url: string) => {
  window.location.assign(url)
}

export const openInNewTab = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer")
}

const planLabel: Record<BillingPlan, string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise"
}

const PlanCard = ({
  title,
  price,
  description,
  current,
  action
}: {
  title: string
  price: string
  description: string
  current: boolean
  action: ReactNode
}) => (
  <div
    className={cn(
      "flex flex-col justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-5",
      current ? "ring-1 ring-primary/20" : "hover:bg-muted/30"
    )}
  >
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold">{title}</p>
        {current ? <Badge variant="secondary">Current</Badge> : null}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{price}</div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    <div>{action}</div>
  </div>
)

export const BillingPanel = () => {
  const addToast = useToastStore(toastSelectors.addToast)
  const { data, isPending } = useBillingSummaryQuery()
  const subscriptionCheckout = useCreateSubscriptionCheckout()
  const topupCheckout = useCreateTopupCheckout()
  const portal = useOpenBillingPortal()

  const onError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback
    addToast({ title: "Billing error", description: message, variant: "error" })
  }

  const currentPlan: BillingPlan = data?.plan ?? "free"
  const actionsRemaining = data?.actionsRemaining ?? 0
  const isWidgetHidden = data?.isWidgetHidden ?? false
  const canManageSubscription = data?.canManageSubscription ?? false

  const isRedirecting = subscriptionCheckout.isPending || topupCheckout.isPending || portal.isPending

  return (
    <PanelShell
      title="Billing"
      description="Manage your plan, usage, and top-ups."
      action={
        canManageSubscription ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || isRedirecting}
            onClick={async () => {
              try {
                const result = await portal.mutateAsync()
                openInNewTab(result.url)
              } catch (error) {
                onError(error, "Could not open customer portal.")
              }
            }}
          >
            <CreditCard className="h-4 w-4" />
            Manage subscription
          </Button>
        ) : null
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-muted/20 p-5 md:col-span-3">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Current plan</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold">{planLabel[currentPlan]}</p>
                {isWidgetHidden ? <Badge variant="destructive">Widget hidden</Badge> : null}
              </div>
              {!isPending && data?.subscriptionRenewsAt ? (
                <p className="text-xs text-muted-foreground">
                  Renews: {new Date(data.subscriptionRenewsAt).toLocaleDateString()}
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Actions remaining</p>
              {isPending ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-3xl font-semibold tabular-nums">{actionsRemaining.toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>

        <PlanCard
          title="Free"
          price="$0"
          description="500 lifetime actions."
          current={currentPlan === "free"}
          action={<Button type="button" variant="secondary" disabled>Included</Button>}
        />

        <PlanCard
          title="Basic"
          price="$399 / month"
          description="15,000 actions per month."
          current={currentPlan === "basic"}
          action={
            <Button
              type="button"
              disabled={isPending || isRedirecting || currentPlan === "basic"}
              onClick={async () => {
                try {
                  const result = await subscriptionCheckout.mutateAsync("basic")
                  navigateToUrl(result.url)
                } catch (error) {
                  onError(error, "Could not start checkout.")
                }
              }}
            >
              <Sparkles className="h-4 w-4" />
              {currentPlan === "basic" ? "Current" : "Choose Basic"}
            </Button>
          }
        />

        <PlanCard
          title="Pro"
          price="$1,299 / month"
          description="60,000 actions per month."
          current={currentPlan === "pro"}
          action={
            <Button
              type="button"
              disabled={isPending || isRedirecting || currentPlan === "pro"}
              onClick={async () => {
                try {
                  const result = await subscriptionCheckout.mutateAsync("pro")
                  navigateToUrl(result.url)
                } catch (error) {
                  onError(error, "Could not start checkout.")
                }
              }}
            >
              <Sparkles className="h-4 w-4" />
              {currentPlan === "pro" ? "Current" : "Choose Pro"}
            </Button>
          }
        />
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-border/70 bg-muted/15 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Action top-ups</p>
            <p className="text-sm text-muted-foreground">Add more actions anytime. Top-ups never expire.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || isRedirecting}
            onClick={async () => {
              try {
                const result = await topupCheckout.mutateAsync("1000")
                navigateToUrl(result.url)
              } catch (error) {
                onError(error, "Could not start checkout.")
              }
            }}
          >
            Buy 1,000 actions ($50)
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || isRedirecting}
            onClick={async () => {
              try {
                const result = await topupCheckout.mutateAsync("5000")
                navigateToUrl(result.url)
              } catch (error) {
                onError(error, "Could not start checkout.")
              }
            }}
          >
            Buy 5,000 actions ($200)
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || isRedirecting}
            onClick={async () => {
              try {
                const result = await topupCheckout.mutateAsync("10000")
                navigateToUrl(result.url)
              } catch (error) {
                onError(error, "Could not start checkout.")
              }
            }}
          >
            Buy 10,000 actions ($350)
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Enterprise plans are custom. Contact sales to set up flexible pricing and action limits.
        </p>
      </div>
    </PanelShell>
  )
}
