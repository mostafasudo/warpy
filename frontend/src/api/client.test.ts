import { describe, it, beforeEach, afterEach, jest } from "@jest/globals"

import { apiClient, configureApiClient, getApiUrl } from "@/api/client"
import type { ToolPayload } from "@/types"
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
    mockFetch(jsonResponse({ baseUrl: { local: "http://localhost" }, headers: {} }))

    await expect(apiClient.getConfig()).resolves.toEqual({ baseUrl: { local: "http://localhost" }, headers: {} })
  })

  it("exposes configured base URL", () => {
    expect(getApiUrl()).toBe("http://api.test")
  })

  it("throws descriptive errors", async () => {
    mockFetch(textResponse("down", 503))

    await expect(apiClient.getConfig()).rejects.toThrow("down")
  })

  it("extracts detail from JSON errors", async () => {
    mockFetch(jsonResponse({ detail: "Stored API key is invalid" }, 400))

    await expect(apiClient.getConfig()).rejects.toThrow("Stored API key is invalid")
  })

  it("falls back to status code when message is empty", async () => {
    mockFetch(textResponse("", 502))

    await expect(apiClient.getConfig()).rejects.toThrow("Request failed with 502")
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
        return jsonResponse({ baseUrl: { local: "http://localhost" }, headers: {} })
      })

    const getToken = jest.fn(async () => "token-123")
      ; (globalThis as typeof globalThis & {
        Clerk?: { session?: { getToken?: typeof getToken } }
      }).Clerk = { session: { getToken } }

    await expect(apiClient.getConfig()).resolves.toEqual({ baseUrl: { local: "http://localhost" }, headers: {} })
    expect(fetchSpy).toHaveBeenCalled()
    expect(getToken).toHaveBeenCalled()
  })

  it("supports config and tool operations", async () => {
    const responses = [
      jsonResponse({ baseUrl: { local: "http://localhost", production: "https://api" }, headers: {} }),
      jsonResponse({
        baseUrl: { local: "http://localhost", production: "https://api", staging: "https://staging" },
        headers: {}
      }),
      jsonResponse({ items: [], page: 2, pageSize: 10, total: 0 }),
      jsonResponse({
        id: "tool-1",
        path: "/users",
        method: "GET",
        agentEnabled: true,
        tool: {
          type: "function",
          function: { name: "list_users", description: "List users", parameters: { type: "object", properties: {}, required: [] } }
        },
        feature: { id: "feature-1", name: "Users", enabledState: "enabled", toolCount: 1 }
      }),
      jsonResponse({
        id: "tool-1",
        path: "/users",
        method: "GET",
        agentEnabled: true,
        tool: {
          type: "function",
          function: { name: "list_users", description: "List users", parameters: { type: "object", properties: {}, required: [] } }
        },
        feature: { id: "feature-1", name: "Users", enabledState: "enabled", toolCount: 1 }
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

    const listed = await apiClient.listTools(2, 10)
    expect(listed.page).toBe(2)
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/tools?page=2&page_size=10", "http://api.test"),
      expect.any(Object)
    )

    const payload: ToolPayload = {
      path: "/users",
      method: "GET",
      tool: {
        type: "function",
        function: { name: "list_users", description: "List users", parameters: { type: "object", properties: {}, required: [] } }
      },
      agentEnabled: true,
      feature: { mode: "auto" }
    }

    const created = await apiClient.createTool(payload)
    expect(created.tool.function.name).toBe("list_users")

    const updated = await apiClient.updateTool("tool-1", payload)
    expect(updated.path).toBe("/users")

    const deleted = await apiClient.deleteTool("tool-1")
    expect(deleted).toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/tools/tool-1", "http://api.test"),
      expect.objectContaining({ method: "DELETE" })
    )
  })

  it("supports onboarding operations", async () => {
    const responses = [
      jsonResponse({ status: "not_started", shouldShow: true, nextStep: "website" }),
      jsonResponse({ status: "in_progress", shouldShow: true, nextStep: "website" }),
      jsonResponse({
        id: "website-1",
        inputUrl: "https://example.com",
        scopeUrl: "https://example.com",
        status: "processing",
        errorMessage: null,
        pageCount: 0,
        readyPageCount: 0,
        failedPageCount: 0,
        searchablePageCount: 0,
        lastCrawledAt: null,
        lastSuccessfulCrawledAt: null,
        nextRefreshAt: null,
        createdAt: "2026-03-21T00:00:00Z",
        updatedAt: "2026-03-21T00:00:00Z"
      }),
      jsonResponse({
        id: "agent-1",
        userId: "user-1",
        createdAt: "2026-03-21T00:00:00Z",
        updatedAt: "2026-03-21T00:00:00Z"
      })
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    await expect(apiClient.getOnboardingState()).resolves.toEqual({
      status: "not_started",
      shouldShow: true,
      nextStep: "website"
    })
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/onboarding/state", "http://api.test"), expect.any(Object))

    await expect(apiClient.startOnboarding()).resolves.toEqual({
      status: "in_progress",
      shouldShow: true,
      nextStep: "website"
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/onboarding/start", "http://api.test"),
      expect.objectContaining({ method: "POST" })
    )

    await expect(apiClient.addOnboardingWebsite({ url: "example.com" })).resolves.toEqual(
      expect.objectContaining({ id: "website-1", scopeUrl: "https://example.com" })
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/onboarding/website", "http://api.test"),
      expect.objectContaining({ method: "POST" })
    )

    await expect(apiClient.finalizeOnboarding()).resolves.toEqual(
      expect.objectContaining({ id: "agent-1", userId: "user-1" })
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/onboarding/finalize", "http://api.test"),
      expect.objectContaining({ method: "POST" })
    )
  })

  it("applies trimmed search term", async () => {
    const fetchSpy = jest.spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 10, total: 0 })))

    await apiClient.listTools(1, 10, "  users ")

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/tools?page=1&page_size=10&search=users", "http://api.test"),
      expect.any(Object)
    )
  })

  it("supports feature operations", async () => {
    const responses = [
      jsonResponse([{ id: "f1", name: "Users", enabledState: "enabled", toolCount: 1, tools: [] }]),
      jsonResponse({ id: "f2", name: "Billing", enabledState: "enabled", toolCount: 0, tools: [] }),
      jsonResponse({ id: "f2", name: "Billing v2", enabledState: "enabled", toolCount: 0, tools: [] }),
      jsonResponse({ id: "f2", name: "Billing v2", enabledState: "disabled", toolCount: 0, tools: [] }),
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

  it("supports MCP connection operations", async () => {
    const responses = [
      jsonResponse([{ id: "conn-1", name: "Stripe MCP", serverUrl: "https://mcp.example.com", authMode: "none" }]),
      jsonResponse({ id: "conn-2", name: "Linear", serverUrl: "https://linear.example.com/mcp", authMode: "static_headers" }),
      jsonResponse({ id: "conn-2", name: "Linear v2", serverUrl: "https://linear.example.com/mcp", authMode: "token_exchange" }),
      textResponse("", 204),
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    await apiClient.listMcpConnections()
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/mcp-connections", "http://api.test"), expect.any(Object))

    await apiClient.createMcpConnection({ name: "Linear", serverUrl: "https://linear.example.com/mcp", authMode: "static_headers", staticHeaders: { Authorization: "Bearer secret" } })
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/mcp-connections", "http://api.test"), expect.objectContaining({ method: "POST" }))

    await apiClient.updateMcpConnection("conn-2", { name: "Linear v2", serverUrl: "https://linear.example.com/mcp", authMode: "token_exchange", tokenExchangePath: "/api/mcp/token-exchange" })
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/mcp-connections/conn-2", "http://api.test"), expect.objectContaining({ method: "PUT" }))

    await apiClient.deleteMcpConnection("conn-2")
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/mcp-connections/conn-2", "http://api.test"), expect.objectContaining({ method: "DELETE" }))
  })

  it("supports widget security operations", async () => {
    const responses = [
      jsonResponse({
        active: {
          requireSignedWidgetToken: false,
          widgetRefreshEndpointPath: "/widget-token",
        },
        draft: null,
        hasStagedChanges: false
      }),
      jsonResponse({
        active: {
          requireSignedWidgetToken: false,
          widgetRefreshEndpointPath: "/widget-token",
        },
        draft: { requireSignedWidgetToken: true, widgetRefreshEndpointPath: null },
        hasStagedChanges: true
      }),
      jsonResponse({
        active: {
          requireSignedWidgetToken: true,
          widgetRefreshEndpointPath: "/widget-token",
        },
        draft: null,
        hasStagedChanges: false
      }),
      jsonResponse({
        active: {
          requireSignedWidgetToken: false,
          widgetRefreshEndpointPath: "/widget-token",
        },
        draft: null,
        hasStagedChanges: false
      }),
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    await apiClient.getAgentWidgetSecurity()
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/agent/widget-security", "http://api.test"), expect.any(Object))

    await apiClient.updateAgentWidgetSecurityDraft({ requireSignedWidgetToken: true })
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/agent/widget-security/draft", "http://api.test"),
      expect.objectContaining({ method: "PATCH" })
    )

    await apiClient.deployAgentWidgetSecurity()
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/agent/widget-security/deploy", "http://api.test"),
      expect.objectContaining({ method: "POST" })
    )

    await apiClient.discardAgentWidgetSecurityDraft()
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/agent/widget-security/discard", "http://api.test"),
      expect.objectContaining({ method: "POST" })
    )
  })

  it("supports api key operations", async () => {
    const responses = [
      jsonResponse({ apiKeyLast4: "1234", createdAt: "2026-04-22T00:00:00Z", rotatedAt: null }),
      jsonResponse({ apiKey: "wrk_key_1234", apiKeyLast4: "1234", createdAt: "2026-04-22T00:00:00Z", rotatedAt: null }),
      jsonResponse({ apiKey: "wrk_key_5678", apiKeyLast4: "5678", createdAt: "2026-04-22T00:00:00Z", rotatedAt: "2026-04-22T01:00:00Z" }),
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    await apiClient.getApiKey()
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/api-key", "http://api.test"), expect.any(Object))

    await apiClient.revealApiKey()
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/api-key/reveal", "http://api.test"),
      expect.objectContaining({ method: "POST" })
    )

    await apiClient.rotateApiKey()
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/api-key/rotate", "http://api.test"),
      expect.objectContaining({ method: "POST" })
    )
  })

  it("supports widget config operations", async () => {
    const responses = [
      jsonResponse({
        widgetTitle: "Warpy",
        widgetIconUrl: null,
        widgetAppearanceMode: "infer",
        widgetTheme: null,
        widgetBehavior: "overlay",
        widgetEmptyTitle: "What would you like to do?",
        widgetEmptyDescription: "Ask a question, request help, or describe what you want to get done.",
        widgetInputPlaceholder: "Ask Warpy…",
        widgetSuggestionsEnabled: false,
        widgetStarterSuggestions: [],
        widgetSecurityDisclosureEnabled: true
      }),
      jsonResponse({
        widgetTitle: "Acme Assistant",
        widgetIconUrl: "https://example.com/icon.png",
        widgetAppearanceMode: "custom",
        widgetTheme: null,
        widgetBehavior: "push",
        widgetEmptyTitle: "How can we help?",
        widgetEmptyDescription: "Ask a question or request help.",
        widgetInputPlaceholder: "Ask Acme…",
        widgetSuggestionsEnabled: true,
        widgetStarterSuggestions: ["Show recent invoices", "Create a refund"],
        widgetSecurityDisclosureEnabled: true
      })
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    await apiClient.getAgentWidgetConfig()
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/agent/widget-config", "http://api.test"), expect.any(Object))

    await apiClient.updateAgentWidgetConfig({
      widgetTitle: "Acme Assistant",
      widgetIconUrl: "https://example.com/icon.png",
      widgetAppearanceMode: "custom",
      widgetTheme: null,
      widgetBehavior: "push",
      widgetEmptyTitle: "How can we help?",
      widgetEmptyDescription: "Ask a question or request help.",
      widgetInputPlaceholder: "Ask Acme…",
      widgetSuggestionsEnabled: true,
      widgetStarterSuggestions: ["Show recent invoices", "Create a refund"],
      widgetSecurityDisclosureEnabled: true
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/agent/widget-config", "http://api.test"),
      expect.objectContaining({ method: "PUT" })
    )
  })

  it("supports widget install operations", async () => {
    const responses = [
      jsonResponse({ framework: "react", packageManager: "npm" }),
      jsonResponse({ framework: "vue", packageManager: "pnpm" })
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    await apiClient.getAgentWidgetInstall()
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/agent/widget-install", "http://api.test"), expect.any(Object))

    await apiClient.updateAgentWidgetInstall({ framework: "vue", packageManager: "pnpm" })
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/agent/widget-install", "http://api.test"),
      expect.objectContaining({ method: "PUT" })
    )
  })

  it("supports custom instruction operations", async () => {
    const responses = [
      jsonResponse({
        customUserSystemPrompt: "You are a helpful copilot for this SaaS product."
      }),
      jsonResponse({
        customUserSystemPrompt: "Be concise and offer next steps."
      })
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    await apiClient.getAgentCustomSystemPrompt()
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/agent/custom-system-prompt", "http://api.test"),
      expect.any(Object)
    )

    await apiClient.updateAgentCustomSystemPrompt({
      customUserSystemPrompt: "Be concise and offer next steps."
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/agent/custom-system-prompt", "http://api.test"),
      expect.objectContaining({ method: "PUT" })
    )
  })

  it("supports billing operations", async () => {
    const responses = [
      jsonResponse({
        plan: "free",
        actionsRemaining: 50,
        monthlyActionsRemaining: 0,
        monthlyActionQuota: 0,
        topupActionsRemaining: 0,
        lifetimeActionsRemaining: 50,
        isWidgetHidden: false,
        canManageSubscription: false,
        subscriptionStatus: null,
        subscriptionRenewsAt: null
      }),
      jsonResponse({ url: "https://checkout.test/basic" }),
      jsonResponse({ url: "https://checkout.test/topup" }),
      jsonResponse({ url: "https://portal.test" })
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    await apiClient.getBillingSummary()
    expect(fetchSpy).toHaveBeenCalledWith(new URL("/billing", "http://api.test"), expect.any(Object))

    await apiClient.createSubscriptionCheckout("basic")
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/billing/checkout/subscription", "http://api.test"),
      expect.objectContaining({ method: "POST" })
    )

    await apiClient.createTopupCheckout("1000")
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/billing/checkout/topup", "http://api.test"),
      expect.objectContaining({ method: "POST" })
    )

    await apiClient.openBillingPortal()
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/billing/portal", "http://api.test"),
      expect.objectContaining({ method: "POST" })
    )
  })

  it("supports activity operations", async () => {
    const responses = [
      jsonResponse({
        conversationCount: 3,
        actionCount: 10,
        hasAnyConversation: true,
        topActions: [{ feature: "Catalog", action: "Fetch products", count: 4 }]
      }),
      jsonResponse({
        items: [
          {
            id: "c1",
            participant: "widget",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-02T00:00:00Z",
            userMessageCount: 2,
            actionCount: 1
          }
        ],
        nextCursor: "cursor-1"
      }),
      jsonResponse({
        id: "c1",
        participant: "widget",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        messages: [{ role: "user", content: "hi", createdAt: "2026-01-02T00:00:00Z" }],
        nextMessageCursor: null,
        actions: [
          {
            id: "a1",
            createdAt: "2026-01-02T00:00:00Z",
            feature: "Catalog",
            action: "Fetch products",
            statusCode: 200,
            error: null,
            request: { params: {}, query: {}, body: {} }
          }
        ],
        nextActionCursor: null
      })
    ]

    const fetchSpy = jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(() => Promise.resolve(responses.shift()!))

    await apiClient.getActivitySummary("2026-01-01", "2026-01-31")
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/activity/summary?start_date=2026-01-01&end_date=2026-01-31", "http://api.test"),
      expect.any(Object)
    )

    await apiClient.listActivityConversations({ startDate: "2026-01-01", endDate: "2026-01-31", limit: 50, cursor: "cursor" })
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/activity/conversations?start_date=2026-01-01&end_date=2026-01-31&limit=50&cursor=cursor", "http://api.test"),
      expect.any(Object)
    )

    await apiClient.getActivityConversationDetail("c1", { messageLimit: 10, actionLimit: 5 })
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("/activity/conversations/c1?message_limit=10&action_limit=5", "http://api.test"),
      expect.any(Object)
    )
  })
})
