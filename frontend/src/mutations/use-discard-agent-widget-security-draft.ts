import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { agentWidgetSecurityQueryKey } from "@/queries/use-agent-widget-security"

export const useDiscardAgentWidgetSecurityDraft = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.discardAgentWidgetSecurityDraft,
    onSuccess: (data) => {
      queryClient.setQueryData(agentWidgetSecurityQueryKey, data)
      queryClient.invalidateQueries({ queryKey: agentWidgetSecurityQueryKey })
    }
  })
}
