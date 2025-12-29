import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const agentQueryKey = ["agent"] as const

export const useAgentQuery = () =>
  useQuery({
    queryKey: agentQueryKey,
    queryFn: apiClient.getAgent,
    retry: false
  })







