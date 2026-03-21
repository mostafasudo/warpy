import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { knowledgeBaseStatusQueryKey } from "@/queries/use-knowledge-base-status"
import { knowledgeWebsitesQueryKey } from "@/queries/use-knowledge-websites"
import { onboardingStateQueryKey } from "@/queries/use-onboarding-state"

export const useAddOnboardingWebsite = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: apiClient.addOnboardingWebsite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeWebsitesQueryKey })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseStatusQueryKey })
      queryClient.invalidateQueries({ queryKey: onboardingStateQueryKey })
    }
  })
}

