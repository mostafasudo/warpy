import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"

export const knowledgeBaseStatusQueryKey = ["knowledge-base-status"] as const

type KnowledgeBaseStatusQueryOptions = {
  refetchInterval?: number | false
}

export const useKnowledgeBaseStatusQuery = (options?: KnowledgeBaseStatusQueryOptions) =>
  useQuery({
    queryKey: knowledgeBaseStatusQueryKey,
    queryFn: apiClient.getKnowledgeBaseStatus,
    refetchInterval: options?.refetchInterval ?? 3000,
  })
