import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { endpointsQueryKey } from "@/queries/use-endpoints"

export const useCreateEndpoint = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.createEndpoint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: endpointsQueryKey })
    }
  })
}
