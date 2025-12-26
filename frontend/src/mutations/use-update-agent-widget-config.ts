import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient, type AgentWidgetConfigUpdate } from "@/api/client"
import { agentWidgetConfigQueryKey } from "@/queries/use-agent-widget-config"

export const useUpdateAgentWidgetConfig = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AgentWidgetConfigUpdate) => apiClient.updateAgentWidgetConfig(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(agentWidgetConfigQueryKey, data)
    }
  })
}

