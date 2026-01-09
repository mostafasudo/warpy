import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const activitySummaryQueryKey = (startDate?: string, endDate?: string) =>
  ["activitySummary", { startDate: startDate ?? null, endDate: endDate ?? null }] as const

export const useActivitySummaryQuery = (startDate?: string, endDate?: string) =>
  useQuery({
    queryKey: activitySummaryQueryKey(startDate, endDate),
    queryFn: () => apiClient.getActivitySummary(startDate, endDate),
    retry: 1,
  })
