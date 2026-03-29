import { useState } from "react"

import { Shell } from "@/components/shell"
import { OnboardingGate } from "@/features/onboarding/onboarding-gate"
import { cn } from "@/lib/utils"
import { useOnboardingStateQuery } from "@/queries/use-onboarding-state"

export const SignedInApp = () => {
  const onboardingStateQuery = useOnboardingStateQuery()
  const [dismissedAfterCompletion, setDismissedAfterCompletion] = useState(false)

  if (onboardingStateQuery.isError || !onboardingStateQuery.data) {
    return (
      <div className="relative">
        <Shell />
        {onboardingStateQuery.isPending ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-10 cursor-progress bg-background/10 backdrop-blur-[1px]"
            data-testid="signed-in-shell-loading"
          />
        ) : null}
      </div>
    )
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

  return (
    <div
      className={cn("relative", onboardingStateQuery.isPending && "pointer-events-none")}
      aria-busy={onboardingStateQuery.isPending}
    >
      <Shell />
      {onboardingStateQuery.isPending ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 bg-background/10 backdrop-blur-[1px]"
          data-testid="signed-in-shell-loading"
        />
      ) : null}
    </div>
  )
}
