import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const toolsQueryKey = ["tools"] as const

export const useToolsQuery = (page: number, pageSize: number, search: string) =>
  useQuery({
    queryKey: [...toolsQueryKey, page, pageSize, search],
    queryFn: () => apiClient.listTools(page, pageSize, search),
    placeholderData: keepPreviousData,
    retry: 1
  })
