import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"

export const knowledgeDocumentContentQueryKey = (id: string) =>
  ["knowledge-document-content", id] as const

export const useKnowledgeDocumentContentQuery = (
  documentId: string | null,
) =>
  useQuery({
    queryKey: knowledgeDocumentContentQueryKey(documentId ?? ""),
    queryFn: () => apiClient.getKnowledgeDocumentContent(documentId!),
    enabled: Boolean(documentId),
  })
