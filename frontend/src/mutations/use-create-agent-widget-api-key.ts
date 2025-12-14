import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { agentWidgetSecurityQueryKey } from "@/queries/use-agent-widget-security"

export const useCreateAgentWidgetApiKey = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.createAgentWidgetApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentWidgetSecurityQueryKey })
    }
  })
}

