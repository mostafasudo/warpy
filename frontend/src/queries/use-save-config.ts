import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { configQueryKey } from "@/queries/use-config"

export const useSaveConfig = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.updateConfig,
    onSuccess: (data) => {
      queryClient.setQueryData(configQueryKey, data)
      queryClient.invalidateQueries({ queryKey: configQueryKey })
    }
  })
}
