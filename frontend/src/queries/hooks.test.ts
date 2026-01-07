import { describe, expect, it, jest } from "@jest/globals"

const queryMock = { useQuery: jest.fn(), useMutation: jest.fn(), useQueryClient: jest.fn() }

jest.mock("@tanstack/react-query", () => queryMock)

const apiClient: Record<string, any> = {
  health: jest.fn(),
  getConfig: jest.fn(),
  updateConfig: jest.fn(),
  listEndpoints: jest.fn(),
  createEndpoint: jest.fn(),
  updateEndpoint: jest.fn(),
  deleteEndpoint: jest.fn(),
  listFeatures: jest.fn(),
  createFeature: jest.fn(),
  updateFeature: jest.fn(),
  toggleFeature: jest.fn(),
  deleteFeature: jest.fn(),
  getBillingSummary: jest.fn(),
  createSubscriptionCheckout: jest.fn(),
  createTopupCheckout: jest.fn(),
  openBillingPortal: jest.fn()
}

jest.mock("@/api/client", () => ({ apiClient }))

describe("react-query hooks", () => {
  beforeEach(() => {
    Object.values(apiClient).forEach((fn) => (fn as jest.Mock).mockReset())
    queryMock.useQuery.mockReset()
    queryMock.useMutation.mockReset()
    queryMock.useQueryClient.mockReset()
  })

  it("configures health query", () => {
    queryMock.useQuery.mockImplementation((options: any) => {
      options.queryFn()
      return { data: "ok" }
    })
    const { useHealthQuery } = require("./use-health")
    ;(apiClient.health as any).mockResolvedValue({ status: "ok" })

    const result = useHealthQuery()

    expect(result.data).toBe("ok")
    expect(apiClient.health).toHaveBeenCalled()
    expect(queryMock.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["health"], retry: false })
    )
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

  it("lists, creates, updates, and deletes endpoints", async () => {
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
    const { useEndpointsQuery } = require("./use-endpoints")
    const { useCreateEndpoint } = require("./use-create-endpoint")
    const { useUpdateEndpoint } = require("./use-update-endpoint")
    const { useDeleteEndpoint } = require("./use-delete-endpoint")

    ;(apiClient.listEndpoints as any).mockResolvedValue({ items: [], total: 0 })
    useEndpointsQuery(1, 5, "test")
    expect(apiClient.listEndpoints).toHaveBeenCalledWith(1, 5, "test")

    ;(apiClient.createEndpoint as any).mockResolvedValue({ id: "1" })
    await useCreateEndpoint().mutateAsync({ path: "/", method: "GET", tool: { type: "function", function: { name: "", description: "", parameters: { type: "object", properties: {} } } }, agentEnabled: true, feature: { mode: "auto" } })
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2)

    ;(apiClient.updateEndpoint as any).mockResolvedValue({ id: "1" })
    await useUpdateEndpoint().mutateAsync({ id: "1", payload: { path: "/", method: "GET", tool: { type: "function", function: { name: "", description: "", parameters: { type: "object", properties: {} } } }, agentEnabled: true, feature: { mode: "auto" } } })
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4)

    ;(apiClient.deleteEndpoint as any).mockResolvedValue(undefined)
    await useDeleteEndpoint().mutateAsync("1")
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
      return { data: { plan: "free", actionsRemaining: 500 } }
    })
    const { useBillingSummaryQuery } = require("./use-billing-summary")
    ;(apiClient.getBillingSummary as any).mockResolvedValue({ plan: "free", actionsRemaining: 500 })

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
})
