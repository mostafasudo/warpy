/// <reference types="@testing-library/jest-dom" />
import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { TooltipProvider } from "@/components/ui/tooltip"
import { useAddKnowledgeWebsite } from "@/mutations/use-add-knowledge-website"
import { useDeleteKnowledgeDocument } from "@/mutations/use-delete-knowledge-document"
import { useDeleteKnowledgeWebsite } from "@/mutations/use-delete-knowledge-website"
import { useRefreshKnowledgeWebsite } from "@/mutations/use-refresh-knowledge-website"
import { useToggleKnowledgeBase } from "@/mutations/use-toggle-knowledge-base"
import { useUploadKnowledgeDocument } from "@/mutations/use-upload-knowledge-document"
import { useAgentQuery } from "@/queries/use-agent"
import { useBillingSummaryQuery } from "@/queries/use-billing-summary"
import { useKnowledgeBaseStatusQuery } from "@/queries/use-knowledge-base-status"
import { useKnowledgeDocumentContentQuery } from "@/queries/use-knowledge-document-content"
import { useKnowledgeDocumentsQuery } from "@/queries/use-knowledge-documents"
import { useKnowledgeWebsiteDetailQuery } from "@/queries/use-knowledge-website-detail"
import { useKnowledgeWebsitesQuery } from "@/queries/use-knowledge-websites"

import { KnowledgeBasePanel } from "./knowledge-base-panel"

jest.mock("@/stores/toast", () => {
  const addToast = jest.fn()
  ;(globalThis as unknown as { __toastAddToast?: jest.Mock }).__toastAddToast =
    addToast

  type ToastState = {
    addToast: jest.Mock
    toasts: unknown[]
    removeToast: jest.Mock
  }

  const toastState: ToastState = {
    addToast,
    toasts: [],
    removeToast: jest.fn(),
  }

  return {
    useToastStore: <T,>(selector: (state: ToastState) => T) =>
      selector(toastState),
    toastSelectors: {
      addToast: (state: ToastState) => state.addToast,
    },
  }
})

jest.mock("@/queries/use-billing-summary", () => ({
  useBillingSummaryQuery: jest.fn(),
  billingSummaryQueryKey: ["billing", "summary"],
}))

jest.mock("@/queries/use-agent", () => ({
  useAgentQuery: jest.fn(),
}))

jest.mock("@/queries/use-knowledge-base-status", () => ({
  useKnowledgeBaseStatusQuery: jest.fn(),
  knowledgeBaseStatusQueryKey: ["knowledge-base-status"],
}))

jest.mock("@/queries/use-knowledge-documents", () => ({
  useKnowledgeDocumentsQuery: jest.fn(),
  knowledgeDocumentsQueryKey: ["knowledge-documents"],
}))

jest.mock("@/queries/use-knowledge-websites", () => ({
  useKnowledgeWebsitesQuery: jest.fn(),
  knowledgeWebsitesQueryKey: ["knowledge-websites"],
}))

jest.mock("@/queries/use-knowledge-document-content", () => ({
  useKnowledgeDocumentContentQuery: jest.fn(),
}))

jest.mock("@/queries/use-knowledge-website-detail", () => ({
  useKnowledgeWebsiteDetailQuery: jest.fn(),
  knowledgeWebsiteDetailQueryKey: jest.fn(),
}))

jest.mock("@/mutations/use-upload-knowledge-document", () => ({
  useUploadKnowledgeDocument: jest.fn(),
}))

jest.mock("@/mutations/use-delete-knowledge-document", () => ({
  useDeleteKnowledgeDocument: jest.fn(),
}))

jest.mock("@/mutations/use-add-knowledge-website", () => ({
  useAddKnowledgeWebsite: jest.fn(),
}))

jest.mock("@/mutations/use-refresh-knowledge-website", () => ({
  useRefreshKnowledgeWebsite: jest.fn(),
}))

jest.mock("@/mutations/use-delete-knowledge-website", () => ({
  useDeleteKnowledgeWebsite: jest.fn(),
}))

jest.mock("@/mutations/use-toggle-knowledge-base", () => ({
  useToggleKnowledgeBase: jest.fn(),
}))

const mockedUseBillingSummaryQuery =
  useBillingSummaryQuery as unknown as jest.Mock
const mockedUseAgentQuery =
  useAgentQuery as unknown as jest.Mock
const mockedUseKnowledgeBaseStatusQuery =
  useKnowledgeBaseStatusQuery as unknown as jest.Mock
const mockedUseKnowledgeDocumentsQuery =
  useKnowledgeDocumentsQuery as unknown as jest.Mock
const mockedUseKnowledgeWebsitesQuery =
  useKnowledgeWebsitesQuery as unknown as jest.Mock
const mockedUseKnowledgeDocumentContentQuery =
  useKnowledgeDocumentContentQuery as unknown as jest.Mock
const mockedUseKnowledgeWebsiteDetailQuery =
  useKnowledgeWebsiteDetailQuery as unknown as jest.Mock
const mockedUseUploadKnowledgeDocument =
  useUploadKnowledgeDocument as unknown as jest.Mock
const mockedUseDeleteKnowledgeDocument =
  useDeleteKnowledgeDocument as unknown as jest.Mock
const mockedUseAddKnowledgeWebsite =
  useAddKnowledgeWebsite as unknown as jest.Mock
const mockedUseRefreshKnowledgeWebsite =
  useRefreshKnowledgeWebsite as unknown as jest.Mock
const mockedUseDeleteKnowledgeWebsite =
  useDeleteKnowledgeWebsite as unknown as jest.Mock
const mockedUseToggleKnowledgeBase =
  useToggleKnowledgeBase as unknown as jest.Mock

type AsyncMutationMock = jest.MockedFunction<
  (...args: unknown[]) => Promise<unknown>
>

const getAddToast = () => {
  const addToast = (globalThis as unknown as { __toastAddToast?: jest.Mock })
    .__toastAddToast
  if (!addToast) throw new Error("addToast mock not initialized")
  return addToast
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}

const mockDoc = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  fileName: "guide.pdf",
  fileType: ".pdf",
  fileSize: 1024,
  status: "ready",
  chunkCount: 4,
  errorMessage: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
})

const mockWebsite = (overrides: Record<string, unknown> = {}) => ({
  id: "website-1",
  inputUrl: "knowledge.example.com",
  scopeUrl: "https://knowledge.example.com/docs",
  status: "processing",
  pageCount: 3,
  readyPageCount: 1,
  failedPageCount: 0,
  searchablePageCount: 1,
  errorMessage: null,
  lastCrawledAt: null,
  lastSuccessfulCrawledAt: null,
  nextRefreshAt: "2024-01-08T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
})

describe("KnowledgeBasePanel", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseBillingSummaryQuery.mockReturnValue({
      data: { plan: "free", actionsRemaining: 50 },
      isLoading: false,
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-1", userId: "user-1" },
      isPending: false,
      error: null,
    })
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 0, readyDocumentCount: 0 },
    })
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0 },
    })
    mockedUseKnowledgeWebsitesQuery.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0 },
    })
    mockedUseKnowledgeDocumentContentQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: undefined,
    })
    mockedUseKnowledgeWebsiteDetailQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: undefined,
    })
    mockedUseUploadKnowledgeDocument.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
    mockedUseDeleteKnowledgeDocument.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
    mockedUseAddKnowledgeWebsite.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
    mockedUseRefreshKnowledgeWebsite.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
    mockedUseDeleteKnowledgeWebsite.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
    mockedUseToggleKnowledgeBase.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
  })

  it("renders loading state", () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: true,
      data: undefined,
    })
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: true,
      data: undefined,
    })
    mockedUseKnowledgeWebsitesQuery.mockReturnValue({
      isLoading: true,
      data: undefined,
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    expect(screen.getByText("Knowledge Base")).toBeTruthy()
  })

  it("renders empty state when no sources exist", async () => {
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    expect(await screen.findByTestId("empty-state")).toBeTruthy()
    expect(screen.getByText("No sources yet")).toBeTruthy()
  })

  it("renders website and document sections", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: true, documentCount: 2, readyDocumentCount: 2 },
    })
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockDoc()], total: 1 },
    })
    mockedUseKnowledgeWebsitesQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [
          mockWebsite({
            status: "partial",
            searchablePageCount: 2,
            errorMessage:
              "Some pages couldn't be read. We're still using the pages that worked.",
          }),
        ],
        total: 1,
      },
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    expect(await screen.findByTestId("website-list")).toBeTruthy()
    expect(screen.getByTestId("document-list")).toBeTruthy()
    expect(screen.getByText("knowledge.example.com")).toBeTruthy()
    expect(screen.getByText("guide.pdf")).toBeTruthy()
    expect(screen.getByText(/3 pages · Next automatic weekly refresh:/)).toBeTruthy()
    expect(
      screen.queryByText("We read everything under this website or path."),
    ).toBeNull()
    expect(screen.queryByText("https://knowledge.example.com/docs")).toBeNull()
    expect(
      screen.queryByText("Some pages couldn't be read. We're still using the pages that worked."),
    ).toBeNull()
  })

  it("keeps the toggle available even when no ready sources exist", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 1, readyDocumentCount: 0 },
    })
    mockedUseKnowledgeWebsitesQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockWebsite({ searchablePageCount: 0 })], total: 1 },
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    expect((await screen.findByTestId("kb-toggle")) as HTMLButtonElement).toHaveProperty(
      "disabled",
      false,
    )
  })

  it("disables the toggle until the agent exists", async () => {
    mockedUseAgentQuery.mockReturnValue({
      data: null,
      isPending: false,
      error: new Error("Agent not found"),
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    expect((await screen.findByTestId("kb-toggle")) as HTMLButtonElement).toHaveProperty(
      "disabled",
      true,
    )
    expect(screen.getByText("Create the agent first, then choose whether it should use your knowledge sources.")).toBeTruthy()
  })

  it("enables toggle when a ready website exists", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 1, readyDocumentCount: 1 },
    })
    mockedUseKnowledgeWebsitesQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [mockWebsite({ status: "partial", searchablePageCount: 1 })],
        total: 1,
      },
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    expect((await screen.findByTestId("kb-toggle")) as HTMLButtonElement).toHaveProperty(
      "disabled",
      false,
    )
  })

  it("calls toggle mutation when switch is clicked", async () => {
    const mutateAsync: AsyncMutationMock = jest.fn()
    mutateAsync.mockResolvedValue({})
    mockedUseToggleKnowledgeBase.mockReturnValue({
      mutateAsync,
      isPending: false,
    })
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 1, readyDocumentCount: 1 },
    })
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockDoc()], total: 1 },
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    fireEvent.click(await screen.findByTestId("kb-toggle"))

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ enabled: true }),
    )
  })

  it("uploads a file from the hidden input", async () => {
    const mutateAsync: AsyncMutationMock = jest.fn()
    mutateAsync.mockResolvedValue({})
    mockedUseUploadKnowledgeDocument.mockReturnValue({
      mutateAsync,
      isPending: false,
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    const input = screen.getByTestId("file-input") as HTMLInputElement
    const file = new File(["content"], "upload.pdf", {
      type: "application/pdf",
    })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(file))
  })

  it("opens the add website dialog and submits the website", async () => {
    const mutateAsync: AsyncMutationMock = jest.fn()
    mutateAsync.mockResolvedValue(mockWebsite())
    mockedUseAddKnowledgeWebsite.mockReturnValue({
      mutateAsync,
      isPending: false,
    })
    mockedUseKnowledgeWebsiteDetailQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        website: mockWebsite(),
        pages: [],
      },
    })
    const user = userEvent.setup()

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    await user.click(await screen.findByTestId("add-website-button"))
    expect(await screen.findByTestId("add-website-dialog")).toBeTruthy()

    await user.type(
      screen.getByTestId("website-url-input"),
      "knowledge.example.com",
    )
    await user.click(screen.getByTestId("submit-website-button"))

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        url: "knowledge.example.com",
      }),
    )
    expect(await screen.findByTestId("website-viewer")).toBeTruthy()
  })

  it("refreshes a website from the row action", async () => {
    const mutateAsync: AsyncMutationMock = jest.fn()
    mutateAsync.mockResolvedValue({})
    mockedUseRefreshKnowledgeWebsite.mockReturnValue({
      mutateAsync,
      isPending: false,
    })
    mockedUseKnowledgeWebsitesQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [mockWebsite({ status: "ready", searchablePageCount: 1 })],
        total: 1,
      },
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    fireEvent.click(await screen.findByTestId("refresh-website-website-1"))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("website-1"))
  })

  it("disables refresh while a website is still processing", async () => {
    const mutateAsync: AsyncMutationMock = jest.fn()
    mutateAsync.mockResolvedValue({})
    mockedUseRefreshKnowledgeWebsite.mockReturnValue({
      mutateAsync,
      isPending: false,
    })
    mockedUseKnowledgeWebsitesQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [mockWebsite({ status: "processing", searchablePageCount: 0 })],
        total: 1,
      },
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    const button = await screen.findByTestId("refresh-website-website-1")
    expect(button).toHaveProperty("disabled", true)
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it("deletes a website from the row action", async () => {
    const mutateAsync: AsyncMutationMock = jest.fn()
    mutateAsync.mockResolvedValue(undefined)
    mockedUseDeleteKnowledgeWebsite.mockReturnValue({
      mutateAsync,
      isPending: false,
    })
    mockedUseKnowledgeWebsitesQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [mockWebsite({ status: "ready", searchablePageCount: 1 })],
        total: 1,
      },
    })
    const user = userEvent.setup()

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    await user.click(await screen.findByTestId("delete-website-website-1"))
    expect(await screen.findByText("Remove this website?")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /remove/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("website-1"))
  })

  it("closes the document viewer when the open document is deleted", async () => {
    const mutateAsync: AsyncMutationMock = jest.fn()
    mutateAsync.mockResolvedValue(undefined)
    mockedUseDeleteKnowledgeDocument.mockReturnValue({
      mutateAsync,
      isPending: false,
    })
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: true, documentCount: 1, readyDocumentCount: 1 },
    })
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockDoc()], total: 1 },
    })
    mockedUseKnowledgeDocumentContentQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "doc-1",
        fileName: "guide.pdf",
        totalChunks: 1,
        chunks: [
          {
            id: "chunk-1",
            content: "hello",
            chunkIndex: 0,
            chunkMetadata: null,
          },
        ],
      },
    })
    const user = userEvent.setup()

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    await user.click(await screen.findByTestId("view-document-doc-1"))
    expect(await screen.findByTestId("document-viewer")).toBeTruthy()

    fireEvent.click(screen.getByTestId("delete-document-doc-1"))
    expect(await screen.findByText("Remove this document?")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /remove/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("doc-1"))
    expect(screen.queryByTestId("document-viewer")).toBeNull()
  })

  it("opens the website viewer while the website is processing", async () => {
    mockedUseKnowledgeWebsitesQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [mockWebsite({ status: "processing", searchablePageCount: 0 })],
        total: 1,
      },
    })
    mockedUseKnowledgeWebsiteDetailQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        website: mockWebsite({ status: "processing", searchablePageCount: 0 }),
        pages: [],
      },
    })
    const user = userEvent.setup()

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    await user.click(await screen.findByTestId("view-website-website-1"))

    expect(await screen.findByTestId("website-viewer")).toBeTruthy()
    expect(
      screen.getByText("The website must be publicly accessible. We read everything under this website or path."),
    ).toBeTruthy()
  })

  it("disables both add buttons for free users with no actions remaining", async () => {
    mockedUseBillingSummaryQuery.mockReturnValue({
      data: { plan: "free", actionsRemaining: 0 },
      isLoading: false,
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    expect((await screen.findByTestId("upload-button")) as HTMLButtonElement).toHaveProperty(
      "disabled",
      true,
    )
    expect(screen.getByTestId("add-website-button")).toHaveProperty(
      "disabled",
      true,
    )
  })

  it("shows document view button only for ready non-image files", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: true, documentCount: 1, readyDocumentCount: 1 },
    })
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [
          mockDoc({ id: "doc-ready", fileType: ".pdf", status: "ready" }),
          mockDoc({ id: "doc-image", fileType: ".png", status: "ready" }),
        ],
        total: 2,
      },
    })

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    expect(await screen.findByTestId("view-document-doc-ready")).toBeTruthy()
    expect(screen.queryByTestId("view-document-doc-image")).toBeNull()
  })

  it("shows an error toast when adding a website fails", async () => {
    const mutateAsync: AsyncMutationMock = jest.fn()
    mutateAsync.mockRejectedValue(
      new Error("That website could not be reached"),
    )
    mockedUseAddKnowledgeWebsite.mockReturnValue({
      mutateAsync,
      isPending: false,
    })
    const user = userEvent.setup()

    render(<KnowledgeBasePanel />, { wrapper: createWrapper() })

    await user.click(await screen.findByTestId("add-website-button"))
    await user.type(
      screen.getByTestId("website-url-input"),
      "knowledge.example.com",
    )
    await user.click(screen.getByTestId("submit-website-button"))

    await waitFor(() =>
      expect(getAddToast()).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Add website failed",
          variant: "error",
        }),
      ),
    )
  })
})
