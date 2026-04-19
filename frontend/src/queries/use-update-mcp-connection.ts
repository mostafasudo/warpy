import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { mcpConnectionsQueryKey } from "@/queries/use-mcp-connections"
import type { McpConnectionPayload } from "@/types"

type UpdateMcpConnectionVariables = {
  id: string
  payload: McpConnectionPayload
}

export const useUpdateMcpConnection = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: UpdateMcpConnectionVariables) => apiClient.updateMcpConnection(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpConnectionsQueryKey })
    },
  })
}

