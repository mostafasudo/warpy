import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const agentCustomSystemPromptQueryKey = ["agent", "custom-system-prompt"] as const

export const useAgentCustomSystemPromptQuery = (enabled = true) =>
  useQuery({
    queryKey: agentCustomSystemPromptQueryKey,
    queryFn: apiClient.getAgentCustomSystemPrompt,
    retry: false,
    enabled
  })
