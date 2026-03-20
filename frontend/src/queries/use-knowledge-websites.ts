import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const knowledgeWebsitesQueryKey = ["knowledge-websites"] as const
const ACTIVE_WEBSITE_POLL_INTERVAL_MS = 3000
const IDLE_WEBSITE_POLL_INTERVAL_MS = 15000

export const useKnowledgeWebsitesQuery = () =>
  useQuery({
    queryKey: knowledgeWebsitesQueryKey,
    queryFn: apiClient.listKnowledgeWebsites,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const items = query.state.data?.items
      if (!items?.length) return false
      if (items.some((website) => website.status === "processing")) {
        return ACTIVE_WEBSITE_POLL_INTERVAL_MS
      }
      return IDLE_WEBSITE_POLL_INTERVAL_MS
    },
    refetchIntervalInBackground: false,
  })
