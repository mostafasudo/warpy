import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { agentFrontendCapabilityQueryKey } from "@/queries/use-agent-frontend-capability"
import type { FrontendCapabilityUpdate } from "@/types"

export const useUpdateAgentFrontendCapability = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (payload: FrontendCapabilityUpdate) => apiClient.updateAgentFrontendCapability(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: agentFrontendCapabilityQueryKey })
        }
    })
}
