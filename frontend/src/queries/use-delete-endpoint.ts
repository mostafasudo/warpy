import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { endpointsQueryKey } from "@/queries/use-endpoints"

export const useDeleteEndpoint = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.deleteEndpoint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: endpointsQueryKey })
    }
  })
}
