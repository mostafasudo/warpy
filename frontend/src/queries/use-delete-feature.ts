import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { featuresQueryKey } from "@/queries/use-features"
import { endpointsQueryKey } from "@/queries/use-endpoints"

export const useDeleteFeature = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteFeature(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featuresQueryKey })
      queryClient.invalidateQueries({ queryKey: endpointsQueryKey })
    }
  })
}
