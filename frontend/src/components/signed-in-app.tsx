import { useState } from "react"

import { Shell } from "@/components/shell"
import { Skeleton } from "@/components/ui/skeleton"
import { OnboardingGate } from "@/features/onboarding/onboarding-gate"
import { useOnboardingStateQuery } from "@/queries/use-onboarding-state"

const SignedInLoading = () => (
  <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12" data-testid="signed-in-loading">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-muted/30" />
      <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-secondary/20 blur-3xl" />
    </div>
    <div className="relative w-full max-w-3xl space-y-6 rounded-[2rem] border border-border/70 bg-card/80 p-8 shadow-xl backdrop-blur">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-14 w-full max-w-lg" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-[1.5rem]" />
    </div>
  </div>
)

export const SignedInApp = () => {
  const onboardingStateQuery = useOnboardingStateQuery()
  const [dismissedAfterCompletion, setDismissedAfterCompletion] = useState(false)

  if (onboardingStateQuery.isPending) {
    return <SignedInLoading />
  }

  if (onboardingStateQuery.isError || !onboardingStateQuery.data) {
    return <Shell />
  }

  if (onboardingStateQuery.data.shouldShow && !dismissedAfterCompletion) {
    return (
      <OnboardingGate
        state={onboardingStateQuery.data}
        onContinueToDashboard={() => {
          setDismissedAfterCompletion(true)
        }}
      />
    )
  }

  return <Shell />
}
