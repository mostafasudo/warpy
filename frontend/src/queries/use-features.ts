import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const featuresQueryKey = ["features"] as const

export const useFeaturesQuery = (search: string) =>
  useQuery({
    queryKey: [...featuresQueryKey, search],
    queryFn: () => apiClient.listFeatures(search),
    placeholderData: keepPreviousData,
    retry: 1
  })
