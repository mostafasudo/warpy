import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const endpointsQueryKey = ["endpoints"] as const

export const useEndpointsQuery = (page: number, pageSize: number, search: string) =>
  useQuery({
    queryKey: [...endpointsQueryKey, page, pageSize, search],
    queryFn: () => apiClient.listEndpoints(page, pageSize, search),
    placeholderData: keepPreviousData,
    retry: 1
  })
