import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const apiKeyQueryKey = ["api-key"] as const

export const useApiKeyQuery = (enabled = true) =>
  useQuery({
    queryKey: apiKeyQueryKey,
    queryFn: apiClient.getApiKey,
    retry: false,
    enabled,
  })
