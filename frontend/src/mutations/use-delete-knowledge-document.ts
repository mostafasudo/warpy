import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/api/client"
import { knowledgeDocumentsQueryKey } from "@/queries/use-knowledge-documents"
import { knowledgeBaseStatusQueryKey } from "@/queries/use-knowledge-base-status"

export const useDeleteKnowledgeDocument = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: apiClient.deleteKnowledgeDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeDocumentsQueryKey })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseStatusQueryKey })
    },
  })
}
