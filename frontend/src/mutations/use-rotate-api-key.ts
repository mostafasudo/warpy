import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { apiKeyQueryKey } from "@/queries/use-api-key"

export const useRotateApiKey = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.rotateApiKey,
    onSuccess: (data) => {
      queryClient.setQueryData(apiKeyQueryKey, {
        apiKeyLast4: data.apiKeyLast4,
        createdAt: data.createdAt,
        rotatedAt: data.rotatedAt,
      })
      queryClient.invalidateQueries({ queryKey: apiKeyQueryKey })
    },
  })
}
