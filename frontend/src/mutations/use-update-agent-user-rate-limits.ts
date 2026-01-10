import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { agentUserRateLimitsQueryKey } from "@/queries/use-agent-user-rate-limits"
import type { UserRateLimitsUpdate } from "@/types"

export const useUpdateAgentUserRateLimits = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (payload: UserRateLimitsUpdate) => apiClient.updateAgentUserRateLimits(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: agentUserRateLimitsQueryKey })
        }
    })
}
