import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import { knowledgeBaseStatusQueryKey } from "@/queries/use-knowledge-base-status"
import { knowledgeWebsiteDetailQueryKey } from "@/queries/use-knowledge-website-detail"
import { knowledgeWebsitesQueryKey } from "@/queries/use-knowledge-websites"

export const useRefreshKnowledgeWebsite = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: apiClient.refreshKnowledgeWebsite,
    onSuccess: (website) => {
      queryClient.invalidateQueries({ queryKey: knowledgeWebsitesQueryKey })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseStatusQueryKey })
      queryClient.invalidateQueries({
        queryKey: knowledgeWebsiteDetailQueryKey(website.id),
      })
    },
  })
}
