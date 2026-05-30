import { describe, expect, it, jest } from "@jest/globals"

const queryMock = { useQuery: jest.fn(), useMutation: jest.fn(), useQueryClient: jest.fn(), useInfiniteQuery: jest.fn() }

jest.mock("@tanstack/react-query", () => queryMock)

const apiClient: Record<string, any> = {
  getConfig: jest.fn(),
  updateConfig: jest.fn(),
  listTools: jest.fn(),
  createTool: jest.fn(),
  updateTool: jest.fn(),
  deleteTool: jest.fn(),
  listFeatures: jest.fn(),
  createFeature: jest.fn(),
  updateFeature: jest.fn(),
  toggleFeature: jest.fn(),
  deleteFeature: jest.fn(),
  getBillingSummary: jest.fn(),
  createSubscriptionCheckout: jest.fn(),
  createTopupCheckout: jest.fn(),
  openBillingPortal: jest.fn(),
  getActivitySummary: jest.fn(),
  listActivityConversations: jest.fn(),
  getActivityConversationDetail: jest.fn(),
}

jest.mock("@/api/client", () => ({ apiClient }))

describe("react-query hooks", () => {
  beforeEach(() => {
    Object.values(apiClient).forEach((fn) => (fn as jest.Mock).mockReset())
    queryMock.useQuery.mockReset()
    queryMock.useMutation.mockReset()
    queryMock.useQueryClient.mockReset()
    queryMock.useInfiniteQuery.mockReset()
  })

  it("fetches config", () => {
    queryMock.useQuery.mockImplementation((options: any) => {
      options.queryFn()
      return { data: { baseUrl: {}, headers: {} } }
    })
    const { useConfigQuery } = require("./use-config")
    ;(apiClient.getConfig as any).mockResolvedValue({ baseUrl: {}, headers: {} })

    useConfigQuery()

    expect(apiClient.getConfig).toHaveBeenCalled()
  })

  it("mutates and caches config", async () => {
    const queryClient = { setQueryData: jest.fn(), invalidateQueries: jest.fn() }
    queryMock.useQueryClient.mockReturnValue(queryClient)
    queryMock.useMutation.mockImplementation((args: any) => {
      const { mutationFn, onSuccess } = args
      return {
        mutateAsync: async (payload: any) => {
          const result = await mutationFn(payload)
          onSuccess(result)
          return result
        }
      }
    })
    const { useSaveConfig } = require("./use-save-config")
    ;(apiClient.updateConfig as any).mockResolvedValue({ baseUrl: { local: "http" }, headers: {} })

    const { mutateAsync } = useSaveConfig()
    await mutateAsync({ baseUrl: {}, headers: {} })

    expect(apiClient.updateConfig).toHaveBeenCalled()
    expect(queryClient.setQueryData).toHaveBeenCalled()
    expect(queryClient.invalidateQueries).toHaveBeenCalled()
  })

  it("lists, creates, updates, and deletes tools", async () => {
    queryMock.useQuery.mockImplementation((options: any) => {
      options.queryFn()
      return { data: { items: [], total: 0 } }
    })
    queryMock.useMutation.mockImplementation((args: any) => {
      const { mutationFn, onSuccess } = args
      return {
        mutateAsync: async (payload: any) => {
          const result = await mutationFn(payload)
          onSuccess?.()
          return result
        }
      }
    })
    const queryClient = { invalidateQueries: jest.fn() }
    queryMock.useQueryClient.mockReturnValue(queryClient)
    const { useToolsQuery } = require("./use-tools")
    const { useCreateTool } = require("./use-create-tool")
    const { useUpdateTool } = require("./use-update-tool")
    const { useDeleteTool } = require("./use-delete-tool")

    ;(apiClient.listTools as any).mockResolvedValue({ items: [], total: 0 })
    useToolsQuery(1, 5, "test")
    expect(apiClient.listTools).toHaveBeenCalledWith(1, 5, "test")

    ;(apiClient.createTool as any).mockResolvedValue({ id: "1" })
    await useCreateTool().mutateAsync({ path: "/", method: "GET", tool: { type: "function", function: { name: "", description: "", parameters: { type: "object", properties: {} } } }, agentEnabled: true, feature: { mode: "auto" } })
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2)

    ;(apiClient.updateTool as any).mockResolvedValue({ id: "1" })
    await useUpdateTool().mutateAsync({ id: "1", payload: { path: "/", method: "GET", tool: { type: "function", function: { name: "", description: "", parameters: { type: "object", properties: {} } } }, agentEnabled: true, feature: { mode: "auto" } } })
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4)

    ;(apiClient.deleteTool as any).mockResolvedValue(undefined)
    await useDeleteTool().mutateAsync("1")
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(6)
  })

  it("handles feature queries and mutations", async () => {
    queryMock.useQuery.mockImplementation((options: any) => {
      options.queryFn()
      return { data: [] }
    })
    queryMock.useMutation.mockImplementation((args: any) => {
      const { mutationFn, onSuccess } = args
      return {
        mutateAsync: async (payload: any) => {
          const result = await mutationFn(payload)
          onSuccess?.()
          return result
        }
      }
    })
    const queryClient = { invalidateQueries: jest.fn() }
    queryMock.useQueryClient.mockReturnValue(queryClient)

    const { useFeaturesQuery } = require("./use-features")
    const { useCreateFeature } = require("./use-create-feature")
    const { useUpdateFeature } = require("./use-update-feature")
    const { useToggleFeature } = require("./use-toggle-feature")
    const { useDeleteFeature } = require("./use-delete-feature")

    ;(apiClient.listFeatures as any).mockResolvedValue([])
    useFeaturesQuery("")
    expect(apiClient.listFeatures).toHaveBeenCalled()

    ;(apiClient.createFeature as any).mockResolvedValue({ id: "f1" })
    await useCreateFeature().mutateAsync({ name: "Billing" })
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2)

    ;(apiClient.updateFeature as any).mockResolvedValue({ id: "f1" })
    await useUpdateFeature().mutateAsync({ id: "f1", payload: { name: "Billing v2" } })
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4)

    ;(apiClient.toggleFeature as any).mockResolvedValue({ id: "f1" })
    await useToggleFeature().mutateAsync({ id: "f1", payload: { agentEnabled: false } })
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(6)

    ;(apiClient.deleteFeature as any).mockResolvedValue(undefined)
    await useDeleteFeature().mutateAsync("f1")
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(8)
  })

  it("fetches billing summary", () => {
    queryMock.useQuery.mockImplementation((options: any) => {
      options.queryFn()
      return { data: { plan: "free", actionsRemaining: 0 } }
    })
    const { useBillingSummaryQuery } = require("./use-billing-summary")
    ;(apiClient.getBillingSummary as any).mockResolvedValue({ plan: "free", actionsRemaining: 0 })

    useBillingSummaryQuery()

    expect(apiClient.getBillingSummary).toHaveBeenCalled()
  })

  it("creates subscription checkout", async () => {
    queryMock.useMutation.mockImplementation((args: any) => {
      const { mutationFn } = args
      return {
        mutateAsync: async (payload: any) => mutationFn(payload)
      }
    })
    const { useCreateSubscriptionCheckout } = require("../mutations/use-create-subscription-checkout")
    ;(apiClient.createSubscriptionCheckout as any).mockResolvedValue({ url: "https://checkout.test" })

    const result = await useCreateSubscriptionCheckout().mutateAsync("basic")

    expect(apiClient.createSubscriptionCheckout).toHaveBeenCalledWith("basic")
    expect(result.url).toBe("https://checkout.test")
  })

  it("creates top-up checkout and opens portal", async () => {
    queryMock.useMutation.mockImplementation((args: any) => {
      const { mutationFn } = args
      return {
        mutateAsync: async (payload: any) => mutationFn(payload)
      }
    })
    const { useCreateTopupCheckout } = require("../mutations/use-create-topup-checkout")
    const { useOpenBillingPortal } = require("../mutations/use-open-billing-portal")
    ;(apiClient.createTopupCheckout as any).mockResolvedValue({ url: "https://checkout.test/topup" })
    ;(apiClient.openBillingPortal as any).mockResolvedValue({ url: "https://portal.test" })

    const topup = await useCreateTopupCheckout().mutateAsync("5000")
    const portal = await useOpenBillingPortal().mutateAsync()

    expect(apiClient.createTopupCheckout).toHaveBeenCalledWith("5000")
    expect(topup.url).toBe("https://checkout.test/topup")
    expect(apiClient.openBillingPortal).toHaveBeenCalled()
    expect(portal.url).toBe("https://portal.test")
  })

  it("fetches activity summary", () => {
    queryMock.useQuery.mockImplementation((options: any) => {
      options.queryFn()
      return { data: { conversationCount: 0, actionCount: 0, hasAnyConversation: false, topActions: [] } }
    })
    const { useActivitySummaryQuery } = require("./use-activity-summary")
    ;(apiClient.getActivitySummary as any).mockResolvedValue({
      conversationCount: 0,
      actionCount: 0,
      hasAnyConversation: false,
      topActions: []
    })

    useActivitySummaryQuery("2026-01-01", "2026-01-31")

    expect(apiClient.getActivitySummary).toHaveBeenCalledWith("2026-01-01", "2026-01-31")
  })

  it("fetches activity conversations with infinite query", () => {
    queryMock.useInfiniteQuery.mockImplementation((options: any) => {
      options.queryFn({ pageParam: undefined })
      return { data: { pages: [] } }
    })
    const { useActivityConversationsInfiniteQuery } = require("./use-activity-conversations")
    ;(apiClient.listActivityConversations as any).mockResolvedValue({ items: [], nextCursor: null })

    useActivityConversationsInfiniteQuery({ startDate: "2026-01-01", endDate: "2026-01-31", limit: 50 })

    expect(apiClient.listActivityConversations).toHaveBeenCalledWith({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      limit: 50,
      cursor: undefined
    })
  })

  it("fetches activity conversation detail with infinite query", () => {
    queryMock.useInfiniteQuery.mockImplementation((options: any) => {
      options.queryFn({ pageParam: undefined })
      return { data: { pages: [] } }
    })
    const { useActivityConversationDetailInfiniteQuery } = require("./use-activity-conversation-detail")
    ;(apiClient.getActivityConversationDetail as any).mockResolvedValue({
      id: "c1",
      participant: "widget",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      messages: [],
      nextMessageCursor: null,
      actions: [],
      nextActionCursor: null
    })

    useActivityConversationDetailInfiniteQuery({ conversationId: "c1", messageLimit: 50, actionLimit: 25 })

    expect(apiClient.getActivityConversationDetail).toHaveBeenCalledWith("c1", {
      messageLimit: 50,
      messageCursor: undefined,
      actionLimit: 25,
      actionCursor: undefined
    })
  })
})
