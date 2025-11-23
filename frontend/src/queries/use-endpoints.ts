import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const endpointsQueryKey = ["endpoints"] as const

export const useEndpointsQuery = (page: number, pageSize: number) =>
  useQuery({
    queryKey: [...endpointsQueryKey, page, pageSize],
    queryFn: () => apiClient.listEndpoints(page, pageSize),
    placeholderData: keepPreviousData,
    retry: 1
  })
