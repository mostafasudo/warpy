import { describe, expect, it, jest } from "@jest/globals"

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(),
}))

jest.mock("@/api/client", () => ({
  apiClient: {
    getApiKey: jest.fn(),
  },
}))

import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"
import { apiKeyQueryKey, useApiKeyQuery } from "./use-api-key"

describe("useApiKeyQuery", () => {
  it("wires query key, fn, and enabled flag", () => {
    ;(useQuery as jest.Mock).mockReturnValue({ data: null })

    useApiKeyQuery(false)

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: apiKeyQueryKey,
        queryFn: apiClient.getApiKey,
        retry: false,
        enabled: false,
      })
    )
  })
})
