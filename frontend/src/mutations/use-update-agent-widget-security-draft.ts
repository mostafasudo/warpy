import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient, type WidgetSecurityDraftUpdate } from "@/api/client"
import { agentWidgetSecurityQueryKey } from "@/queries/use-agent-widget-security"

export const useUpdateAgentWidgetSecurityDraft = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: WidgetSecurityDraftUpdate) => apiClient.updateAgentWidgetSecurityDraft(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(agentWidgetSecurityQueryKey, data)
    }
  })
}
