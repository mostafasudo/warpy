import { describe, expect, it } from "@jest/globals"

import { buildScriptSnippet, normalizeCustomerBaseUrl } from "@/lib/widget-install"

describe("widget-install", () => {
  it("normalizes host-only base URLs to https", () => {
    expect(normalizeCustomerBaseUrl("api.example.com")).toBe("https://api.example.com")
    expect(normalizeCustomerBaseUrl(" https://api.example.com ")).toBe("https://api.example.com")
  })

  it("builds a script tag without a base URL when one is not set", () => {
    expect(buildScriptSnippet("agent-1", "", "https://cdn.example.com/widget/agent.js")).toBe(
      `<script src="https://cdn.example.com/widget/agent.js"
  data-agent-id="agent-1"
></script>`
    )
  })
})
