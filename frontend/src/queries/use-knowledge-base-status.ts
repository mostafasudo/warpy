import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"

export const knowledgeBaseStatusQueryKey = ["knowledge-base-status"] as const

export const useKnowledgeBaseStatusQuery = () =>
  useQuery({
    queryKey: knowledgeBaseStatusQueryKey,
    queryFn: apiClient.getKnowledgeBaseStatus,
    refetchInterval: 3000,
  })
