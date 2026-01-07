import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const billingSummaryQueryKey = ["billing", "summary"] as const

export const useBillingSummaryQuery = (enabled = true) =>
  useQuery({
    queryKey: billingSummaryQueryKey,
    queryFn: apiClient.getBillingSummary,
    enabled,
    retry: 1
  })

