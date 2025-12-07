import { describe, it, beforeEach, afterEach, jest } from "@jest/globals"

import { apiClient, configureApiClient } from "@/api/client"
import type { EndpointPayload } from "@/types"
import { jsonResponse, mockFetch, textResponse } from "@/test/http"

describe("apiClient", () => {
  beforeEach(() => {
    configureApiClient({ apiUrl: "http://api.test", apiTimeoutMs: 100 })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete (globalThis as typeof globalThis & { Clerk?: unknown }).Clerk
  })

  it("resolves JSON payload", async () => {
    mockFetch(jsonResponse({ status: "ready" }))

    await expect(apiClient.health()).resolves.toEqual({ status: "ready" })
  })

  it("throws descriptive errors", async () => {
    mockFetch(textResponse("down", 503))

    await expect(apiClient.health()).rejects.toThrow("down")
  })

  it("falls back to status code when message is empty", async () => {
    mockFetch(textResponse("", 502))

    await expect(apiClient.health()).rejects.toThrow("Request failed with 502")
  })

  it("throws when response is empty", async () => {
    const emptyResponse = {
      ok: true,
      status: 200,
      text: async () => ""
    } as Response
    mockFetch(emptyResponse)

    await expect(apiClient.getConfig()).rejects.toThrow("Expected response body")
  })

  it("attaches session token when available", async () => {
    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(async (_input, init) => {
        const headers = init?.headers as Headers | undefined
        expect(headers?.get("Authorization")).toBe("Bearer token-123")
        return jsonResponse({ status: "ready" })
      })

    const getToken = jest.fn(async () => "token-123")
    ;(globalThis as typeof globalThis & {
      Clerk?: { session?: { getToken?: typeof getToken } }
    }).Clerk = { session: { getToken } }

    await expect(apiClient.health()).resolves.toEqual({ status: "ready" })
    expect(fetchSpy).toHaveBeenCalled()
    expect(getToken).toHaveBeenCalled()
  })

  it("supports config and endpoint operations", async () => {
    const responses = [
      jsonResponse({ baseUrl: { local: "http://localhost", production: "https://api" }, headers: {} }),
      jsonResponse({
        baseUrl: { local: "http://localhost", production: "https://api", staging: "https://staging" },
        headers: {}
      }),
      jsonResponse({ items: [], page: 2, pageSize: 10, total: 0 }),
      jsonResponse({
        id: "endpoint-1",
        path: "/users",
        method: "GET",
        agentEnabled: true,
        tool: {
          type: "function",
          function: { name: "list_users", description: "List users", parameters: { type: "object", properties: {}, required: [] } }
        },
        feature: { id: "feature-1", name: "Users", enabledState: "enabled", endpointCount: 1 }
      }),
      jsonResponse({
        id: "endpoint-1",
        path: "/users",
        method: "GET",
        agentEnabled: true,
        tool: {
          type: "function",
          function: { name: "list_users", description: "List users", parameters: { type: "object", properties: {}, required: [] } }
        },
        feature: { id: "feature-1", name: "Users", enabledState: "enabled", endpointCount: 1 }
      }),
      textResponse("", 204)
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    const config = await apiClient.getConfig()
    expect(config.baseUrl.local).toBe("http://localhost")
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/config", "http://api.test"), expect.any(Object))

    const updatedConfig = await apiClient.updateConfig({
      baseUrl: { ...config.baseUrl, staging: "https://staging" },
      headers: {}
    })
    expect(updatedConfig.baseUrl.staging).toBe("https://staging")

    const listed = await apiClient.listEndpoints(2, 10)
    expect(listed.page).toBe(2)
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/endpoints?page=2&page_size=10", "http://api.test"),
      expect.any(Object)
    )

    const payload: EndpointPayload = {
      path: "/users",
      method: "GET",
      tool: {
        type: "function",
        function: { name: "list_users", description: "List users", parameters: { type: "object", properties: {}, required: [] } }
      },
      agentEnabled: true,
      feature: { mode: "auto" }
    }

    const created = await apiClient.createEndpoint(payload)
    expect(created.tool.function.name).toBe("list_users")

    const updated = await apiClient.updateEndpoint("endpoint-1", payload)
    expect(updated.path).toBe("/users")

    const deleted = await apiClient.deleteEndpoint("endpoint-1")
    expect(deleted).toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/endpoints/endpoint-1", "http://api.test"),
      expect.objectContaining({ method: "DELETE" })
    )
  })

  it("applies trimmed search term", async () => {
    const fetchSpy = jest.spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 10, total: 0 })))

    await apiClient.listEndpoints(1, 10, "  users ")

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/endpoints?page=1&page_size=10&search=users", "http://api.test"),
      expect.any(Object)
    )
  })

  it("supports feature operations", async () => {
    const responses = [
      jsonResponse([{ id: "f1", name: "Users", enabledState: "enabled", endpointCount: 1, endpoints: [] }]),
      jsonResponse({ id: "f2", name: "Billing", enabledState: "enabled", endpointCount: 0, endpoints: [] }),
      jsonResponse({ id: "f2", name: "Billing v2", enabledState: "enabled", endpointCount: 0, endpoints: [] }),
      jsonResponse({ id: "f2", name: "Billing v2", enabledState: "disabled", endpointCount: 0, endpoints: [] }),
      textResponse("", 204)
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    await apiClient.listFeatures(" users ")
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/features?search=users", "http://api.test"), expect.any(Object))

    await apiClient.createFeature({ name: "Billing" })
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/features", "http://api.test"), expect.objectContaining({ method: "POST" }))

    await apiClient.updateFeature("f2", { name: "Billing v2" })
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/features/f2", "http://api.test"), expect.objectContaining({ method: "PUT" }))

    await apiClient.toggleFeature("f2", { agentEnabled: false })
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/features/f2/enabled", "http://api.test"), expect.objectContaining({ method: "POST" }))

    await apiClient.deleteFeature("f2")
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/features/f2", "http://api.test"), expect.objectContaining({ method: "DELETE" }))
  })
})
