import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const featureToolsQueryKey = (featureId: string, page: number) =>
  ["features", featureId, "tools", page] as const

export const useFeatureToolsQuery = (
  featureId: string,
  page: number,
  enabled = true,
) =>
  useQuery({
    queryKey: featureToolsQueryKey(featureId, page),
    queryFn: () => apiClient.listFeatureTools(featureId, page),
    placeholderData: keepPreviousData,
    enabled,
    retry: 1,
  })
