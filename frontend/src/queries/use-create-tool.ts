import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { featuresQueryKey } from "@/queries/use-features"
import { toolsQueryKey } from "@/queries/use-tools"

export const useCreateTool = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.createTool,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsQueryKey })
      queryClient.invalidateQueries({ queryKey: featuresQueryKey })
    }
  })
}
