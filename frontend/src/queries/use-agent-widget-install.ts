import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const agentWidgetInstallQueryKey = ["agent", "widget-install"] as const

export const useAgentWidgetInstallQuery = (enabled = true) =>
  useQuery({
    queryKey: agentWidgetInstallQueryKey,
    queryFn: apiClient.getAgentWidgetInstall,
    retry: false,
    enabled
  })
