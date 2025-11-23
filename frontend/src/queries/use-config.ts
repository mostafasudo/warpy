import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const configQueryKey = ["config"] as const

export const useConfigQuery = () =>
  useQuery({
    queryKey: configQueryKey,
    queryFn: apiClient.getConfig,
    retry: 1
  })
