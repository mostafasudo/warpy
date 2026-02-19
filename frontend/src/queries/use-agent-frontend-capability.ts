import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const agentFrontendCapabilityQueryKey = ["agent", "frontend-capability"] as const

export const useAgentFrontendCapabilityQuery = (enabled = true) =>
    useQuery({
        queryKey: agentFrontendCapabilityQueryKey,
        queryFn: apiClient.getAgentFrontendCapability,
        retry: false,
        enabled
    })
