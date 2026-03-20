import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/api/client"
import type { KnowledgeWebsiteListResponse } from "@/types"

import { knowledgeWebsitesQueryKey } from "./use-knowledge-websites"

export const knowledgeWebsiteDetailQueryKey = (websiteId: string | null) =>
  ["knowledge-website-detail", websiteId] as const

export const useKnowledgeWebsiteDetailQuery = (websiteId: string | null) => {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: knowledgeWebsiteDetailQueryKey(websiteId),
    queryFn: () => apiClient.getKnowledgeWebsiteDetail(websiteId || ""),
    enabled: Boolean(websiteId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const website = query.state.data?.website
      if (website?.status === "processing") return 3000
      return false
    },
  })

  useEffect(() => {
    const website = query.data?.website
    if (!website) return

    queryClient.setQueryData<KnowledgeWebsiteListResponse | undefined>(
      knowledgeWebsitesQueryKey,
      (current) => {
        if (!current) return current

        const index = current.items.findIndex((item) => item.id === website.id)
        if (index === -1) return current

        const items = [...current.items]
        items[index] = website
        return { ...current, items }
      },
    )
  }, [query.data?.website, queryClient])

  return query
}
