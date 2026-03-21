import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const onboardingStateQueryKey = ["onboarding-state"] as const

export const useOnboardingStateQuery = () =>
  useQuery({
    queryKey: onboardingStateQueryKey,
    queryFn: apiClient.getOnboardingState,
    retry: false
  })

