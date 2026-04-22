import { beforeEach, describe, expect, it, jest } from "@jest/globals"

let invalidateQueries: jest.Mock
let setQueryData: jest.Mock

jest.mock("@tanstack/react-query", () => {
  invalidateQueries = jest.fn()
  setQueryData = jest.fn()
  return {
    useMutation: jest.fn((options) => options),
    useQueryClient: jest.fn(() => ({ invalidateQueries, setQueryData }))
  }
})

jest.mock("@/api/client", () => ({
  apiClient: {
    updateAgentWidgetSecurityDraft: jest.fn(),
    deployAgentWidgetSecurity: jest.fn(),
    discardAgentWidgetSecurityDraft: jest.fn()
  }
}))

import { agentWidgetSecurityQueryKey } from "@/queries/use-agent-widget-security"
import { useDeployAgentWidgetSecurity } from "./use-deploy-agent-widget-security"
import { useDiscardAgentWidgetSecurityDraft } from "./use-discard-agent-widget-security-draft"
import { useUpdateAgentWidgetSecurityDraft } from "./use-update-agent-widget-security-draft"
import { useMutation } from "@tanstack/react-query"

describe("widget security mutations", () => {
  beforeEach(() => {
    ;(useMutation as unknown as jest.Mock).mockClear()
    invalidateQueries.mockClear()
    setQueryData.mockClear()
  })

  it("updates cache after draft update", () => {
    useUpdateAgentWidgetSecurityDraft()
    const options = (useMutation as unknown as jest.Mock).mock.calls[0]?.[0] as any
    const next = {
      active: {
        requireSignedWidgetToken: true,
        widgetRefreshEndpointPath: "/widget-token",
      },
      draft: null,
      hasStagedChanges: false
    }
    options.onSuccess?.(next, undefined, undefined)
    expect(setQueryData).toHaveBeenCalledWith(agentWidgetSecurityQueryKey, next)
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it("updates cache and invalidates after deploy", () => {
    useDeployAgentWidgetSecurity()
    const options = (useMutation as unknown as jest.Mock).mock.calls[0]?.[0] as any
    const next = {
      active: {
        requireSignedWidgetToken: true,
        widgetRefreshEndpointPath: "/widget-token",
      },
      draft: null,
      hasStagedChanges: false
    }
    options.onSuccess?.(next, undefined, undefined)
    expect(setQueryData).toHaveBeenCalledWith(agentWidgetSecurityQueryKey, next)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: agentWidgetSecurityQueryKey })
  })

  it("updates cache and invalidates after discard", () => {
    useDiscardAgentWidgetSecurityDraft()
    const options = (useMutation as unknown as jest.Mock).mock.calls[0]?.[0] as any
    const next = {
      active: {
        requireSignedWidgetToken: false,
        widgetRefreshEndpointPath: "/widget-token",
      },
      draft: null,
      hasStagedChanges: false
    }
    options.onSuccess?.(next, undefined, undefined)
    expect(setQueryData).toHaveBeenCalledWith(agentWidgetSecurityQueryKey, next)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: agentWidgetSecurityQueryKey })
  })
})
