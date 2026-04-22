import { beforeEach, describe, expect, it, jest } from "@jest/globals"

let invalidateQueries: jest.Mock
let setQueryData: jest.Mock

jest.mock("@tanstack/react-query", () => {
  invalidateQueries = jest.fn()
  setQueryData = jest.fn()
  return {
    useMutation: jest.fn((options) => options),
    useQueryClient: jest.fn(() => ({ invalidateQueries, setQueryData })),
  }
})

jest.mock("@/api/client", () => ({
  apiClient: {
    revealApiKey: jest.fn(),
    rotateApiKey: jest.fn(),
  },
}))

import { useMutation } from "@tanstack/react-query"
import { apiKeyQueryKey } from "@/queries/use-api-key"
import { useRevealApiKey } from "./use-reveal-api-key"
import { useRotateApiKey } from "./use-rotate-api-key"

describe("api key mutations", () => {
  beforeEach(() => {
    ;(useMutation as unknown as jest.Mock).mockClear()
    invalidateQueries.mockClear()
    setQueryData.mockClear()
  })

  it("wires reveal api key mutation without cache writes", () => {
    useRevealApiKey()
    const options = (useMutation as unknown as jest.Mock).mock.calls[0]?.[0] as any
    expect(options.mutationFn).toBeDefined()
    options.onSuccess?.({ apiKey: "wrk_test", apiKeyLast4: "1234" }, undefined, undefined)
    expect(setQueryData).not.toHaveBeenCalled()
  })

  it("updates cache after key rotation", () => {
    useRotateApiKey()
    const options = (useMutation as unknown as jest.Mock).mock.calls[0]?.[0] as any
    options.onSuccess?.(
      {
        apiKey: "wrk_test",
        apiKeyLast4: "1234",
        createdAt: "2026-04-22T00:00:00Z",
        rotatedAt: "2026-04-22T01:00:00Z",
      },
      undefined,
      undefined
    )
    expect(setQueryData).toHaveBeenCalledWith(apiKeyQueryKey, {
      apiKeyLast4: "1234",
      createdAt: "2026-04-22T00:00:00Z",
      rotatedAt: "2026-04-22T01:00:00Z",
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: apiKeyQueryKey })
  })
})
