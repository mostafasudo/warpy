import { describe, expect, it, jest } from "@jest/globals"

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn()
}))

jest.mock("@/api/client", () => ({
  apiClient: {
    getAgentCustomSystemPrompt: jest.fn()
  }
}))

import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"
import {
  agentCustomSystemPromptQueryKey,
  useAgentCustomSystemPromptQuery,
} from "./use-agent-custom-system-prompt"

describe("useAgentCustomSystemPromptQuery", () => {
  it("wires query key, fn, and enabled flag", () => {
    ;(useQuery as jest.Mock).mockReturnValue({ data: null })

    useAgentCustomSystemPromptQuery(false)

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: agentCustomSystemPromptQueryKey,
        queryFn: apiClient.getAgentCustomSystemPrompt,
        retry: false,
        enabled: false
      })
    )
  })
})
