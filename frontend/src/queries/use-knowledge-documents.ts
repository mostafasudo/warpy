import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"

export const knowledgeDocumentsQueryKey = ["knowledge-documents"] as const

export const useKnowledgeDocumentsQuery = () =>
  useQuery({
    queryKey: knowledgeDocumentsQueryKey,
    queryFn: apiClient.listKnowledgeDocuments,
    refetchInterval: (query) => {
      const items = query.state.data?.items
      if (items?.some((d) => d.status === "processing")) return 3000
      return false
    },
  })
