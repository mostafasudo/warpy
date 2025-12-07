import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { featuresQueryKey } from "@/queries/use-features"
import { endpointsQueryKey } from "@/queries/use-endpoints"
import type { FeatureTogglePayload } from "@/types"

export const useToggleFeature = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FeatureTogglePayload }) =>
      apiClient.toggleFeature(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featuresQueryKey })
      queryClient.invalidateQueries({ queryKey: endpointsQueryKey })
    }
  })
}
