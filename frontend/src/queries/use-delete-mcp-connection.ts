import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { mcpConnectionsQueryKey } from "@/queries/use-mcp-connections"

export const useDeleteMcpConnection = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.deleteMcpConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpConnectionsQueryKey })
    },
  })
}
