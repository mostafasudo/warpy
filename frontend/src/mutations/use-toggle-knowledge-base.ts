import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/api/client"
import { knowledgeBaseStatusQueryKey } from "@/queries/use-knowledge-base-status"

export const useToggleKnowledgeBase = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.toggleKnowledgeBase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseStatusQueryKey })
    },
  })
}
