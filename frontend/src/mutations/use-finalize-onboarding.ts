import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { agentQueryKey } from "@/queries/use-agent"

export const useFinalizeOnboarding = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: apiClient.finalizeOnboarding,
    onSuccess: (data) => {
      queryClient.setQueryData(agentQueryKey, data)
    }
  })
}

