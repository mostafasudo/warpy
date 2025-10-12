import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const healthQueryKey = ["health"] as const

export const useHealthQuery = () =>
  useQuery({
    queryKey: healthQueryKey,
    queryFn: () => apiClient.health(),
    retry: false
  })
