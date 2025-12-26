import { describe, expect, it, jest } from "@jest/globals"

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn()
}))

jest.mock("@/api/client", () => ({
  apiClient: {
    getAgentWidgetConfig: jest.fn()
  }
}))

import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"
import { agentWidgetConfigQueryKey, useAgentWidgetConfigQuery } from "./use-agent-widget-config"

describe("useAgentWidgetConfigQuery", () => {
  it("wires query key, fn, and enabled flag", () => {
    ;(useQuery as jest.Mock).mockReturnValue({ data: null })

    useAgentWidgetConfigQuery(false)

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: agentWidgetConfigQueryKey,
        queryFn: apiClient.getAgentWidgetConfig,
        retry: false,
        enabled: false
      })
    )
  })
})

