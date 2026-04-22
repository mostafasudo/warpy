import { describe, expect, it } from "@jest/globals"

import { configureApiClient } from "@/api/client"
import { buildCodingAgentPrompt, buildWidgetTokenRefreshPrompt, getIntegrationDocUrl, maskApiKey } from "./agent-integration"

describe("agent integration helpers", () => {
  it("builds the public manual url from the api base url", () => {
    configureApiClient({ apiUrl: "https://api.warpy.ai", apiTimeoutMs: 1000 })
    expect(getIntegrationDocUrl()).toBe("https://api.warpy.ai/static/integrate-warpy.md")
  })

  it("masks api keys by last four", () => {
    expect(maskApiKey("1234")).toBe("••••••••••••1234")
  })

  it("builds the coding agent prompt", () => {
    configureApiClient({ apiUrl: "https://api.warpy.ai", apiTimeoutMs: 1000 })
    const prompt = buildCodingAgentPrompt("wrk_test_1234")
    expect(prompt).toBe(
      "Fetch https://api.warpy.ai/static/integrate-warpy.md and follow the instructions to integrate Warpy into this project. My API key is: wrk_test_1234"
    )
  })

  it("builds the widget token refresh prompt", () => {
    const prompt = buildWidgetTokenRefreshPrompt("https://api.warpy.ai", "/widget-token")
    expect(prompt).toContain("POST /widget-token")
    expect(prompt).toContain("POST https://api.warpy.ai/widget-token Authorization: Bearer <WARPY_API_KEY>")
  })
})
