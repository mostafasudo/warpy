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
    updateAgentCustomSystemPrompt: jest.fn()
  }
}))

import { useMutation } from "@tanstack/react-query"
import { agentCustomSystemPromptQueryKey } from "@/queries/use-agent-custom-system-prompt"
import { useUpdateAgentCustomSystemPrompt } from "./use-update-agent-custom-system-prompt"

describe("custom system prompt mutations", () => {
  beforeEach(() => {
    ;(useMutation as unknown as jest.Mock).mockClear()
    setQueryData.mockClear()
  })

  it("updates cache after custom system prompt update", () => {
    useUpdateAgentCustomSystemPrompt()
    const options = (useMutation as unknown as jest.Mock).mock.calls[0]?.[0] as {
      onSuccess?: (data: unknown, variables: unknown, context: unknown) => void
    }
    const next = { customUserSystemPrompt: "Keep it simple." }
    options.onSuccess?.(next, undefined, undefined)
    expect(setQueryData).toHaveBeenCalledWith(agentCustomSystemPromptQueryKey, next)
  })
})
