import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient, type CustomUserSystemPromptUpdate } from "@/api/client"
import { agentCustomSystemPromptQueryKey } from "@/queries/use-agent-custom-system-prompt"

export const useUpdateAgentCustomSystemPrompt = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CustomUserSystemPromptUpdate) =>
      apiClient.updateAgentCustomSystemPrompt(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(agentCustomSystemPromptQueryKey, data)
    }
  })
}
