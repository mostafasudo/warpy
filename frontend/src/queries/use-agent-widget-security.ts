import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const agentWidgetSecurityQueryKey = ["agent", "widget-security"] as const

export const useAgentWidgetSecurityQuery = (enabled = true) =>
  useQuery({
    queryKey: agentWidgetSecurityQueryKey,
    queryFn: apiClient.getAgentWidgetSecurity,
    retry: false,
    enabled
  })
