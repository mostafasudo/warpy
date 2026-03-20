/// <reference types="@testing-library/jest-dom" />
import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { useKnowledgeWebsiteDetailQuery } from "@/queries/use-knowledge-website-detail"

import { WebsiteViewer } from "./website-viewer"

jest.mock("@/queries/use-knowledge-website-detail", () => ({
  useKnowledgeWebsiteDetailQuery: jest.fn(),
  knowledgeWebsiteDetailQueryKey: jest.fn(),
}))

const mockedUseKnowledgeWebsiteDetailQuery =
  useKnowledgeWebsiteDetailQuery as unknown as jest.Mock

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const mockDetail = {
  website: {
    id: "website-1",
    inputUrl: "knowledge.example.com",
    scopeUrl: "https://knowledge.example.com/docs",
    status: "partial",
    pageCount: 3,
    readyPageCount: 2,
    failedPageCount: 1,
    searchablePageCount: 2,
    errorMessage: "Some pages couldn't be read. We're still using the pages that worked.",
    lastCrawledAt: "2024-01-01T00:00:00Z",
    lastSuccessfulCrawledAt: "2024-01-01T00:00:00Z",
    nextRefreshAt: "2024-01-08T00:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  pages: [
    {
      id: "page-1",
      pageName: "Getting Started",
      sourceUrl: "https://knowledge.example.com/docs/getting-started",
      status: "ready",
      sectionCount: 4,
      isSearchable: true,
      errorMessage: null,
      updatedAt: "2024-01-01T00:00:00Z",
    },
    {
      id: "page-2",
      pageName: "Broken Page",
      sourceUrl: "https://knowledge.example.com/docs/broken",
      status: "error",
      sectionCount: 0,
      isSearchable: false,
      errorMessage: "This page is not publicly accessible",
      updatedAt: "2024-01-01T00:00:00Z",
    },
  ],
}

describe("WebsiteViewer", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseKnowledgeWebsiteDetailQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: mockDetail,
    })
  })

  it("is hidden when websiteId is null", () => {
    render(<WebsiteViewer websiteId={null} onOpenChange={jest.fn()} />, {
      wrapper: createWrapper(),
    })

    expect(screen.queryByTestId("website-viewer")).toBeNull()
  })

  it("renders loading state", async () => {
    mockedUseKnowledgeWebsiteDetailQuery.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    })

    render(<WebsiteViewer websiteId="website-1" onOpenChange={jest.fn()} />, {
      wrapper: createWrapper(),
    })

    expect(await screen.findByTestId("website-viewer-loading")).toBeTruthy()
  })

  it("renders error state", async () => {
    mockedUseKnowledgeWebsiteDetailQuery.mockReturnValue({
      isPending: false,
      isError: true,
      data: undefined,
    })

    render(<WebsiteViewer websiteId="website-1" onOpenChange={jest.fn()} />, {
      wrapper: createWrapper(),
    })

    expect(await screen.findByTestId("website-viewer-error")).toBeTruthy()
  })

  it("keeps cached website details visible when a refetch fails", async () => {
    mockedUseKnowledgeWebsiteDetailQuery.mockReturnValue({
      isPending: false,
      isError: true,
      data: mockDetail,
    })

    render(<WebsiteViewer websiteId="website-1" onOpenChange={jest.fn()} />, {
      wrapper: createWrapper(),
    })

    expect(await screen.findByTestId("website-page-list")).toBeTruthy()
    expect(screen.queryByTestId("website-viewer-error")).toBeNull()
  })

  it("renders website summary and pages", async () => {
    render(<WebsiteViewer websiteId="website-1" onOpenChange={jest.fn()} />, {
      wrapper: createWrapper(),
    })

    expect(await screen.findByTestId("website-page-list")).toBeTruthy()
    expect(screen.getByText("knowledge.example.com")).toBeTruthy()
    expect(screen.getByText("Getting Started")).toBeTruthy()
    expect(screen.getByText("Broken Page")).toBeTruthy()
    expect(screen.getByText("This page is not publicly accessible")).toBeTruthy()
    expect(screen.queryByText(/Scope:/)).toBeNull()
    expect(screen.queryByText(/Refresh any time/)).toBeNull()
    expect(screen.queryByText(/Available to your agent/)).toBeNull()
  })

  it("shows a ready badge when a failed refresh is still searchable", async () => {
    mockedUseKnowledgeWebsiteDetailQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        website: mockDetail.website,
        pages: [
          {
            ...mockDetail.pages[1],
            status: "error",
            isSearchable: true,
          },
        ],
      },
    })

    render(<WebsiteViewer websiteId="website-1" onOpenChange={jest.fn()} />, {
      wrapper: createWrapper(),
    })

    expect(await screen.findByText("Broken Page")).toBeTruthy()
    expect(screen.getByText("Ready")).toBeTruthy()
    expect(screen.getByText("This page is not publicly accessible")).toBeTruthy()
  })

  it("renders an empty message before pages arrive", async () => {
    mockedUseKnowledgeWebsiteDetailQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        website: mockDetail.website,
        pages: [],
      },
    })

    render(<WebsiteViewer websiteId="website-1" onOpenChange={jest.fn()} />, {
      wrapper: createWrapper(),
    })

    expect(await screen.findByTestId("website-viewer-empty")).toBeTruthy()
  })
})
