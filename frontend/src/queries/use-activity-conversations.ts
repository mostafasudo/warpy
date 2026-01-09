import { useInfiniteQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

export const activityConversationsQueryKey = (startDate?: string, endDate?: string, limit?: number) =>
  ["activityConversations", { startDate: startDate ?? null, endDate: endDate ?? null, limit: limit ?? null }] as const

export const useActivityConversationsInfiniteQuery = (options: {
  startDate?: string
  endDate?: string
  limit?: number
}) =>
  useInfiniteQuery({
    queryKey: activityConversationsQueryKey(options.startDate, options.endDate, options.limit),
    queryFn: ({ pageParam }) =>
      apiClient.listActivityConversations({
        startDate: options.startDate,
        endDate: options.endDate,
        limit: options.limit,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: 1,
  })
