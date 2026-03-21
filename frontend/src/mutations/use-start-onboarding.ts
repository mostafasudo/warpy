import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { onboardingStateQueryKey } from "@/queries/use-onboarding-state"

export const useStartOnboarding = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.startOnboarding,
    onSuccess: (data) => {
      queryClient.setQueryData(onboardingStateQueryKey, data)
    }
  })
}

