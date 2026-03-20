import { describe, expect, it, jest } from "@jest/globals"

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(),
}))

jest.mock("@/api/client", () => ({
  apiClient: {
    listKnowledgeWebsites: jest.fn(),
  },
}))

import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/api/client"

import {
  knowledgeWebsitesQueryKey,
  useKnowledgeWebsitesQuery,
} from "./use-knowledge-websites"

describe("useKnowledgeWebsitesQuery", () => {
  it("wires polling and refetch behavior for website status updates", () => {
    ;(useQuery as jest.Mock).mockReturnValue({ data: null })

    useKnowledgeWebsitesQuery()

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: knowledgeWebsitesQueryKey,
        queryFn: apiClient.listKnowledgeWebsites,
        refetchOnMount: "always",
        refetchOnWindowFocus: true,
        refetchIntervalInBackground: false,
      }),
    )

    const queryOptions = (useQuery as jest.Mock).mock.calls[0][0] as {
      refetchInterval: (query: { state: { data?: { items?: Array<{ status: string }> } } }) => number | false
    }

    expect(
      queryOptions.refetchInterval({ state: { data: undefined } }),
    ).toBe(false)
    expect(
      queryOptions.refetchInterval({
        state: { data: { items: [{ status: "processing" }] } },
      }),
    ).toBe(3000)
    expect(
      queryOptions.refetchInterval({
        state: { data: { items: [{ status: "ready" }] } },
      }),
    ).toBe(15000)
  })
})
