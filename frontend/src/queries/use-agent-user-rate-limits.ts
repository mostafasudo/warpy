import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const agentUserRateLimitsQueryKey = ["agent", "user-rate-limits"] as const

export const useAgentUserRateLimitsQuery = (enabled = true) =>
    useQuery({
        queryKey: agentUserRateLimitsQueryKey,
        queryFn: apiClient.getAgentUserRateLimits,
        retry: false,
        enabled
    })
