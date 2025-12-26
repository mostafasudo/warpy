import { beforeEach, describe, expect, it, jest } from "@jest/globals"

let setQueryData: jest.Mock

jest.mock("@tanstack/react-query", () => {
  setQueryData = jest.fn()
  return {
    useMutation: jest.fn((options) => options),
    useQueryClient: jest.fn(() => ({ setQueryData }))
  }
})

jest.mock("@/api/client", () => ({
  apiClient: {
    updateAgentWidgetConfig: jest.fn()
  }
}))

import { agentWidgetConfigQueryKey } from "@/queries/use-agent-widget-config"
import { useUpdateAgentWidgetConfig } from "./use-update-agent-widget-config"
import { useMutation } from "@tanstack/react-query"

describe("widget config mutations", () => {
  beforeEach(() => {
    ;(useMutation as unknown as jest.Mock).mockClear()
    setQueryData.mockClear()
  })

  it("updates cache after widget config update", () => {
    useUpdateAgentWidgetConfig()
    const options = (useMutation as unknown as jest.Mock).mock.calls[0]?.[0] as any
    const next = {
      widgetTitle: "Acme",
      widgetSubtitle: "Ready",
      widgetIconUrl: null,
      widgetEmptyTitle: "Hi",
      widgetEmptyDescription: "Hello",
      widgetInputPlaceholder: "Ask…"
    }
    options.onSuccess?.(next, undefined, undefined)
    expect(setQueryData).toHaveBeenCalledWith(agentWidgetConfigQueryKey, next)
  })
})

