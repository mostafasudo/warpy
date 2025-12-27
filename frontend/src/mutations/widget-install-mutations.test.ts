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
    updateAgentWidgetInstall: jest.fn()
  }
}))

import { agentWidgetInstallQueryKey } from "@/queries/use-agent-widget-install"
import { useUpdateAgentWidgetInstall } from "./use-update-agent-widget-install"
import { useMutation } from "@tanstack/react-query"

describe("widget install mutations", () => {
  beforeEach(() => {
    ;(useMutation as unknown as jest.Mock).mockClear()
    setQueryData.mockClear()
  })

  it("updates cache after widget install update", () => {
    useUpdateAgentWidgetInstall()
    const options = (useMutation as unknown as jest.Mock).mock.calls[0]?.[0] as any
    const next = { framework: "react", packageManager: "npm" }
    options.onSuccess?.(next, undefined, undefined)
    expect(setQueryData).toHaveBeenCalledWith(agentWidgetInstallQueryKey, next)
  })
})
