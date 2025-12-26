import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const agentWidgetConfigQueryKey = ["agent", "widget-config"] as const

export const useAgentWidgetConfigQuery = (enabled = true) =>
  useQuery({
    queryKey: agentWidgetConfigQueryKey,
    queryFn: apiClient.getAgentWidgetConfig,
    retry: false,
    enabled
  })

