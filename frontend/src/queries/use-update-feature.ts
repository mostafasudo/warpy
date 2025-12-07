import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { featuresQueryKey } from "@/queries/use-features"
import { endpointsQueryKey } from "@/queries/use-endpoints"
import type { FeaturePayload } from "@/types"

export const useUpdateFeature = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FeaturePayload }) =>
      apiClient.updateFeature(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featuresQueryKey })
      queryClient.invalidateQueries({ queryKey: endpointsQueryKey })
    }
  })
}
