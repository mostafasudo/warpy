/// <reference types="@testing-library/jest-dom" />
import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import { render, waitFor } from "@testing-library/react"
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query"

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query") as typeof import("@tanstack/react-query")
  return {
    ...actual,
    useQuery: jest.fn(),
  }
})

jest.mock("@/api/client", () => ({
  apiClient: {
    getKnowledgeWebsiteDetail: jest.fn(),
  },
}))

import { apiClient } from "@/api/client"
import type {
  KnowledgeWebsiteDetailResponse,
  KnowledgeWebsiteListResponse,
  KnowledgeWebsiteResponse,
} from "@/types"

import { knowledgeWebsitesQueryKey } from "./use-knowledge-websites"
import {
  knowledgeWebsiteDetailQueryKey,
  useKnowledgeWebsiteDetailQuery,
} from "./use-knowledge-website-detail"

const mockedUseQuery = useQuery as unknown as jest.Mock

const createWebsite = (
  overrides: Partial<KnowledgeWebsiteResponse> = {},
): KnowledgeWebsiteResponse => ({
  id: "website-1",
  inputUrl: "knowledge.example.com",
  scopeUrl: "https://knowledge.example.com",
  status: "partial",
  pageCount: 12,
  readyPageCount: 10,
  failedPageCount: 2,
  searchablePageCount: 10,
  errorMessage: "Some pages couldn't be read.",
  lastCrawledAt: null,
  lastSuccessfulCrawledAt: null,
  nextRefreshAt: "2024-01-08T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
})

const createWrapper = (queryClient: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

const DetailHarness = ({ websiteId }: { websiteId: string | null }) => {
  useKnowledgeWebsiteDetailQuery(websiteId)
  return null
}

describe("useKnowledgeWebsiteDetailQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("wires query key, fn, enabled flag, and polling behavior", () => {
    mockedUseQuery.mockReturnValue({ data: undefined })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(<DetailHarness websiteId="website-1" />, {
      wrapper: createWrapper(queryClient),
    })

    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: knowledgeWebsiteDetailQueryKey("website-1"),
        queryFn: expect.any(Function),
        enabled: true,
        refetchOnMount: "always",
        refetchOnWindowFocus: true,
      }),
    )

    const queryOptions = mockedUseQuery.mock.calls[0][0] as {
      queryFn: () => Promise<KnowledgeWebsiteDetailResponse>
      refetchInterval: (query: {
        state: { data?: { website?: { status: string } } }
      }) => number | false
    }

    expect(queryOptions.queryFn).toBeDefined()
    expect(apiClient.getKnowledgeWebsiteDetail).not.toHaveBeenCalled()
    void queryOptions.queryFn()
    expect(apiClient.getKnowledgeWebsiteDetail).toHaveBeenCalledWith("website-1")
    expect(
      queryOptions.refetchInterval({
        state: { data: { website: { status: "processing" } } },
      }),
    ).toBe(3000)
    expect(
      queryOptions.refetchInterval({
        state: { data: { website: { status: "ready" } } },
      }),
    ).toBe(false)
  })

  it("syncs the latest website detail into the outer website list cache", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const cachedWebsite = createWebsite()
    const updatedWebsite = createWebsite({
      status: "processing",
      pageCount: 14,
      readyPageCount: 11,
      failedPageCount: 0,
      searchablePageCount: 11,
      errorMessage: null,
      updatedAt: "2024-01-02T00:00:00Z",
    })
    const detailResponse: KnowledgeWebsiteDetailResponse = {
      website: updatedWebsite,
      pages: [],
    }

    queryClient.setQueryData<KnowledgeWebsiteListResponse>(
      knowledgeWebsitesQueryKey,
      {
        items: [cachedWebsite],
        total: 1,
      },
    )
    mockedUseQuery.mockReturnValue({ data: detailResponse })

    render(<DetailHarness websiteId="website-1" />, {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => {
      expect(
        queryClient.getQueryData<KnowledgeWebsiteListResponse>(
          knowledgeWebsitesQueryKey,
        ),
      ).toEqual({
        items: [updatedWebsite],
        total: 1,
      })
    })
  })
})
