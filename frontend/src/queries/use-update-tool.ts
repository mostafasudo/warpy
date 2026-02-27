import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { featuresQueryKey } from "@/queries/use-features"
import { toolsQueryKey } from "@/queries/use-tools"
import type { ToolPayload } from "@/types"

export const useUpdateTool = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ToolPayload }) =>
      apiClient.updateTool(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsQueryKey })
      queryClient.invalidateQueries({ queryKey: featuresQueryKey })
    }
  })
}
