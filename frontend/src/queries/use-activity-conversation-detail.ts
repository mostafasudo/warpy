import { useInfiniteQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

type PageParam = {
  messageCursor?: string
  actionCursor?: string
}

export const activityConversationDetailQueryKey = (conversationId: string | null, messageLimit: number, actionLimit: number) =>
  ["activityConversationDetail", { conversationId, messageLimit, actionLimit }] as const

export const useActivityConversationDetailInfiniteQuery = (options: {
  conversationId: string | null
  messageLimit?: number
  actionLimit?: number
}) => {
  const conversationId = options.conversationId
  const messageLimit = options.messageLimit ?? 200
  const actionLimit = options.actionLimit ?? 200

  return useInfiniteQuery({
    queryKey: activityConversationDetailQueryKey(conversationId, messageLimit, actionLimit),
    queryFn: ({ pageParam }) => {
      if (!conversationId) {
        throw new Error("Conversation id is required")
      }
      return apiClient.getActivityConversationDetail(conversationId, {
        messageLimit,
        messageCursor: pageParam?.messageCursor,
        actionLimit,
        actionCursor: pageParam?.actionCursor,
      })
    },
    initialPageParam: undefined as PageParam | undefined,
    getNextPageParam: (lastPage) => {
      const messageCursor = lastPage.nextMessageCursor ?? undefined
      const actionCursor = lastPage.nextActionCursor ?? undefined
      if (!messageCursor && !actionCursor) return undefined
      return { messageCursor, actionCursor }
    },
    enabled: Boolean(conversationId),
    retry: 1,
  })
}
