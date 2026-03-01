/// <reference types="@testing-library/jest-dom" />
import { describe, it, jest, beforeEach } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TooltipProvider } from "@/components/ui/tooltip";
import { KnowledgeBasePanel } from "./knowledge-base-panel";
import { useBillingSummaryQuery } from "@/queries/use-billing-summary";
import { useKnowledgeBaseStatusQuery } from "@/queries/use-knowledge-base-status";
import { useKnowledgeDocumentsQuery } from "@/queries/use-knowledge-documents";
import { useUploadKnowledgeDocument } from "@/mutations/use-upload-knowledge-document";
import { useDeleteKnowledgeDocument } from "@/mutations/use-delete-knowledge-document";
import { useToggleKnowledgeBase } from "@/mutations/use-toggle-knowledge-base";

jest.mock("@/stores/toast", () => {
  const addToast = jest.fn();
  (globalThis as unknown as { __toastAddToast?: jest.Mock }).__toastAddToast =
    addToast;
  type ToastState = {
    addToast: jest.Mock;
    toasts: unknown[];
    removeToast: jest.Mock;
  };
  const toastState: ToastState = {
    addToast,
    toasts: [],
    removeToast: jest.fn(),
  };
  return {
    useToastStore: <T,>(selector: (state: ToastState) => T) =>
      selector(toastState),
    toastSelectors: {
      addToast: (state: ToastState) => state.addToast,
    },
  };
});

const getAddToast = () => {
  const addToast = (globalThis as unknown as { __toastAddToast?: jest.Mock })
    .__toastAddToast;
  if (!addToast) throw new Error("addToast mock not initialized");
  return addToast;
};

jest.mock("@/queries/use-billing-summary", () => ({
  useBillingSummaryQuery: jest.fn(),
  billingSummaryQueryKey: ["billing", "summary"],
}));

jest.mock("@/queries/use-knowledge-base-status", () => ({
  useKnowledgeBaseStatusQuery: jest.fn(),
  knowledgeBaseStatusQueryKey: ["knowledge-base-status"],
}));

jest.mock("@/queries/use-knowledge-documents", () => ({
  useKnowledgeDocumentsQuery: jest.fn(),
  knowledgeDocumentsQueryKey: ["knowledge-documents"],
}));

jest.mock("@/mutations/use-upload-knowledge-document", () => ({
  useUploadKnowledgeDocument: jest.fn(),
}));

jest.mock("@/mutations/use-delete-knowledge-document", () => ({
  useDeleteKnowledgeDocument: jest.fn(),
}));

jest.mock("@/mutations/use-toggle-knowledge-base", () => ({
  useToggleKnowledgeBase: jest.fn(),
}));

jest.mock("@/queries/use-knowledge-document-content", () => ({
  useKnowledgeDocumentContentQuery: jest.fn().mockReturnValue({
    isPending: false,
    isError: false,
    data: undefined,
  }),
}));

const mockedUseBillingSummaryQuery =
  useBillingSummaryQuery as unknown as jest.Mock;
const mockedUseKnowledgeBaseStatusQuery =
  useKnowledgeBaseStatusQuery as unknown as jest.Mock;
const mockedUseKnowledgeDocumentsQuery =
  useKnowledgeDocumentsQuery as unknown as jest.Mock;
const mockedUseUploadKnowledgeDocument =
  useUploadKnowledgeDocument as unknown as jest.Mock;
const mockedUseDeleteKnowledgeDocument =
  useDeleteKnowledgeDocument as unknown as jest.Mock;
const mockedUseToggleKnowledgeBase =
  useToggleKnowledgeBase as unknown as jest.Mock;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
};

const mockDoc = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  fileName: "test.pdf",
  fileType: ".pdf",
  fileSize: 1024,
  status: "ready",
  chunkCount: 5,
  errorMessage: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("KnowledgeBasePanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseBillingSummaryQuery.mockReturnValue({
      data: { plan: "free", actionsRemaining: 50 },
      isLoading: false,
    });
    mockedUseUploadKnowledgeDocument.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    mockedUseDeleteKnowledgeDocument.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    mockedUseToggleKnowledgeBase.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
  });

  it("renders loading skeleton", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: true,
      data: undefined,
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: true,
      data: undefined,
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    expect(screen.getByText("Knowledge Base")).toBeTruthy();
  });

  it("renders empty state when no documents", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 0, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    expect(await screen.findByTestId("empty-state")).toBeTruthy();
    expect(screen.getByText("No documents yet")).toBeTruthy();
  });

  it("renders a prominent activation card for the toggle", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 0, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    expect(await screen.findByTestId("kb-toggle-card")).toBeTruthy();
    expect(
      screen.getByText("Use uploaded documents in agent answers"),
    ).toBeTruthy();
  });

  it("renders document list with ready document", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: true, documentCount: 1, readyDocumentCount: 1 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockDoc()], total: 1 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    expect(await screen.findByTestId("document-list")).toBeTruthy();
    expect(screen.getByText("test.pdf")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText(/5 sections/)).toBeTruthy();
  });

  it("renders processing badge for processing documents", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 1, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [mockDoc({ status: "processing", chunkCount: 0 })],
        total: 1,
      },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    expect(await screen.findByText("Processing")).toBeTruthy();
  });

  it("renders failed badge for errored documents", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 1, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [
          mockDoc({
            status: "error",
            errorMessage: "Parse failed",
            chunkCount: 0,
          }),
        ],
        total: 1,
      },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    expect(await screen.findByText("Failed")).toBeTruthy();
  });

  it("toggle is disabled when no ready documents", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 0, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    const toggle = await screen.findByTestId("kb-toggle");
    expect(toggle).toBeDisabled();
  });

  it("toggle is enabled when ready documents exist", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 1, readyDocumentCount: 1 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockDoc()], total: 1 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    const toggle = await screen.findByTestId("kb-toggle");
    expect(toggle).not.toBeDisabled();
  });

  it("calls toggle mutation when switch clicked", async () => {
    const mutateAsync = jest.fn<() => Promise<unknown>>().mockResolvedValue({});
    mockedUseToggleKnowledgeBase.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 1, readyDocumentCount: 1 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockDoc()], total: 1 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    const toggle = await screen.findByTestId("kb-toggle");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ enabled: true }),
    );
    await waitFor(() =>
      expect(getAddToast()).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "success" }),
      ),
    );
  });

  it("uploads file via file input", async () => {
    const mutateAsync = jest.fn<() => Promise<unknown>>().mockResolvedValue({});
    mockedUseUploadKnowledgeDocument.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 0, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["content"], "upload.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(file));
  });

  it("shows toast on upload error", async () => {
    const mutateAsync = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(new Error("fail"));
    mockedUseUploadKnowledgeDocument.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 0, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["content"], "upload.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(getAddToast()).toHaveBeenCalled());
  });

  it("opens delete dialog and deletes document", async () => {
    const mutateAsync = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue(undefined);
    mockedUseDeleteKnowledgeDocument.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: true, documentCount: 1, readyDocumentCount: 1 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockDoc()], total: 1 },
    });
    const user = userEvent.setup();
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    await user.click(await screen.findByTestId("delete-document-doc-1"));
    expect(await screen.findByText("Remove this document?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("doc-1"));
    await waitFor(() =>
      expect(getAddToast()).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "success", title: "Document removed" }),
      ),
    );
  });

  it("shows toast on toggle error", async () => {
    const mutateAsync = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(new Error("fail"));
    mockedUseToggleKnowledgeBase.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 1, readyDocumentCount: 1 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockDoc()], total: 1 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByTestId("kb-toggle"));
    await waitFor(() => expect(getAddToast()).toHaveBeenCalled());
  });

  it("formats file size correctly", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 2, readyDocumentCount: 2 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [
          mockDoc({ id: "d1", fileSize: 500, fileName: "small.txt" }),
          mockDoc({ id: "d2", fileSize: 2 * 1024 * 1024, fileName: "big.pdf" }),
        ],
        total: 2,
      },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    expect(await screen.findByText(/500 B/)).toBeTruthy();
    expect(screen.getByText(/2\.0 MB/)).toBeTruthy();
  });

  it("shows 1 section singular for single chunk", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 1, readyDocumentCount: 1 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockDoc({ chunkCount: 1 })], total: 1 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    expect(await screen.findByText(/1 section$/)).toBeTruthy();
  });

  it("shows view button for ready non-image documents", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: true, documentCount: 1, readyDocumentCount: 1 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [mockDoc({ fileType: ".pdf", status: "ready" })], total: 1 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    expect(await screen.findByTestId("view-document-doc-1")).toBeTruthy();
  });

  it("hides view button for image files", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: true, documentCount: 1, readyDocumentCount: 1 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [mockDoc({ fileType: ".png", status: "ready" })],
        total: 1,
      },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    await screen.findByTestId("document-list");
    expect(screen.queryByTestId("view-document-doc-1")).toBeNull();
  });

  it("hides view button for processing documents", async () => {
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 1, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: {
        items: [mockDoc({ fileType: ".pdf", status: "processing", chunkCount: 0 })],
        total: 1,
      },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    await screen.findByTestId("document-list");
    expect(screen.queryByTestId("view-document-doc-1")).toBeNull();
  });

  it("disables upload button when free plan with no actions remaining", async () => {
    mockedUseBillingSummaryQuery.mockReturnValue({
      data: { plan: "free", actionsRemaining: 0 },
      isLoading: false,
    });
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 0, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    const button = await screen.findByTestId("upload-button");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables upload button when free plan with actions remaining", async () => {
    mockedUseBillingSummaryQuery.mockReturnValue({
      data: { plan: "free", actionsRemaining: 10 },
      isLoading: false,
    });
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 0, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    const button = await screen.findByTestId("upload-button");
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("enables upload button for paid plan with no actions remaining", async () => {
    mockedUseBillingSummaryQuery.mockReturnValue({
      data: { plan: "basic", actionsRemaining: 0 },
      isLoading: false,
    });
    mockedUseKnowledgeBaseStatusQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false, documentCount: 0, readyDocumentCount: 0 },
    });
    mockedUseKnowledgeDocumentsQuery.mockReturnValue({
      isLoading: false,
      data: { items: [], total: 0 },
    });
    render(<KnowledgeBasePanel />, { wrapper: createWrapper() });
    const button = await screen.findByTestId("upload-button");
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
