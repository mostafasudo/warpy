import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient, type AgentWidgetInstallUpdate } from "@/api/client"
import { agentWidgetInstallQueryKey } from "@/queries/use-agent-widget-install"

export const useUpdateAgentWidgetInstall = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AgentWidgetInstallUpdate) => apiClient.updateAgentWidgetInstall(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(agentWidgetInstallQueryKey, data)
    }
  })
}
