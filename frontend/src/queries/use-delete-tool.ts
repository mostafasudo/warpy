import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { featuresQueryKey } from "@/queries/use-features"
import { toolsQueryKey } from "@/queries/use-tools"

export const useDeleteTool = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.deleteTool,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsQueryKey })
      queryClient.invalidateQueries({ queryKey: featuresQueryKey })
    }
  })
}
