import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { featuresQueryKey } from "@/queries/use-features"
import { toolsQueryKey } from "@/queries/use-tools"

export const useDeleteFeature = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteFeature(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featuresQueryKey })
      queryClient.invalidateQueries({ queryKey: toolsQueryKey })
    }
  })
}
