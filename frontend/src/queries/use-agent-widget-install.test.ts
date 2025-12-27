import { describe, expect, it, jest } from "@jest/globals"

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn()
}))

jest.mock("@/api/client", () => ({
  apiClient: {
    getAgentWidgetInstall: jest.fn()
  }
}))

import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"
import { agentWidgetInstallQueryKey, useAgentWidgetInstallQuery } from "./use-agent-widget-install"

describe("useAgentWidgetInstallQuery", () => {
  it("wires query key, fn, and enabled flag", () => {
    ;(useQuery as jest.Mock).mockReturnValue({ data: null })

    useAgentWidgetInstallQuery(false)

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: agentWidgetInstallQueryKey,
        queryFn: apiClient.getAgentWidgetInstall,
        retry: false,
        enabled: false
      })
    )
  })
})
