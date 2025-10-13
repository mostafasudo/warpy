import { describe, it, beforeEach, afterEach, jest } from "@jest/globals"

import { apiClient, configureApiClient } from "@/api/client"
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
})
