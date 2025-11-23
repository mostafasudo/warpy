import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { endpointsQueryKey } from "@/queries/use-endpoints"
import type { EndpointPayload } from "@/types"

export const useUpdateEndpoint = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EndpointPayload }) =>
      apiClient.updateEndpoint(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: endpointsQueryKey })
    }
  })
}
