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
  deleteEndpoint: jest.fn()
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
    await useCreateEndpoint().mutateAsync({ path: "/", method: "GET", tool: { type: "function", function: { name: "", description: "", parameters: { type: "object", properties: {} } } }, agentEnabled: true })
    expect(queryClient.invalidateQueries).toHaveBeenCalled()

    ;(apiClient.updateEndpoint as any).mockResolvedValue({ id: "1" })
    await useUpdateEndpoint().mutateAsync({ id: "1", payload: { path: "/", method: "GET", tool: { type: "function", function: { name: "", description: "", parameters: { type: "object", properties: {} } } }, agentEnabled: true } })
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2)

    ;(apiClient.deleteEndpoint as any).mockResolvedValue(undefined)
    await useDeleteEndpoint().mutateAsync("1")
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(3)
  })
})
