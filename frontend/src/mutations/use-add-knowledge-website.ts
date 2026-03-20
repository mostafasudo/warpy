import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { knowledgeBaseStatusQueryKey } from "@/queries/use-knowledge-base-status"
import { knowledgeWebsitesQueryKey } from "@/queries/use-knowledge-websites"

export const useAddKnowledgeWebsite = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: apiClient.addKnowledgeWebsite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeWebsitesQueryKey })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseStatusQueryKey })
    },
  })
}
