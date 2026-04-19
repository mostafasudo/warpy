import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const mcpConnectionsQueryKey = ["mcp-connections"] as const

export const useMcpConnectionsQuery = () =>
  useQuery({
    queryKey: mcpConnectionsQueryKey,
    queryFn: apiClient.listMcpConnections,
    retry: 1,
  })

