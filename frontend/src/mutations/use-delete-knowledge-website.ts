import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { knowledgeBaseStatusQueryKey } from "@/queries/use-knowledge-base-status"
import { knowledgeWebsiteDetailQueryKey } from "@/queries/use-knowledge-website-detail"
import { knowledgeWebsitesQueryKey } from "@/queries/use-knowledge-websites"

export const useDeleteKnowledgeWebsite = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: apiClient.deleteKnowledgeWebsite,
    onSuccess: (_result, websiteId) => {
      queryClient.invalidateQueries({ queryKey: knowledgeWebsitesQueryKey })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseStatusQueryKey })
      queryClient.removeQueries({
        queryKey: knowledgeWebsiteDetailQueryKey(websiteId),
      })
    },
  })
}
