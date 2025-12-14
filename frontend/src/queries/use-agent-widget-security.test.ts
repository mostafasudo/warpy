import { describe, expect, it, jest } from "@jest/globals"

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn()
}))

jest.mock("@/api/client", () => ({
  apiClient: {
    getAgentWidgetSecurity: jest.fn()
  }
}))

import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"
import { agentWidgetSecurityQueryKey, useAgentWidgetSecurityQuery } from "./use-agent-widget-security"

describe("useAgentWidgetSecurityQuery", () => {
  it("wires query key, fn, and enabled flag", () => {
    ;(useQuery as jest.Mock).mockReturnValue({ data: null })

    useAgentWidgetSecurityQuery(false)

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: agentWidgetSecurityQueryKey,
        queryFn: apiClient.getAgentWidgetSecurity,
        retry: false,
        enabled: false
      })
    )
  })
})

