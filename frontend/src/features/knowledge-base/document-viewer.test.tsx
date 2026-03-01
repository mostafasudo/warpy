/// <reference types="@testing-library/jest-dom" />
import { describe, it, jest, beforeEach, expect } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DocumentViewer, isViewableDocument } from "./document-viewer";
import { useKnowledgeDocumentContentQuery } from "@/queries/use-knowledge-document-content";

jest.mock("@/queries/use-knowledge-document-content", () => ({
  useKnowledgeDocumentContentQuery: jest.fn(),
}));

const mockedQuery =
  useKnowledgeDocumentContentQuery as unknown as jest.Mock;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const mockChunks = [
  { id: "c1", content: "Hello world paragraph one", chunkIndex: 0, chunkMetadata: null },
  { id: "c2", content: "Second world section here", chunkIndex: 1, chunkMetadata: null },
];

describe("isViewableDocument", () => {
  it("returns true for pdf with ready status", () => {
    expect(isViewableDocument(".pdf", "ready")).toBe(true);
  });

  it("returns true for txt with ready status", () => {
    expect(isViewableDocument(".txt", "ready")).toBe(true);
  });

  it("returns false for png with ready status", () => {
    expect(isViewableDocument(".png", "ready")).toBe(false);
  });

  it("returns false for jpg with ready status", () => {
    expect(isViewableDocument(".jpg", "ready")).toBe(false);
  });

  it("returns false for jpeg with ready status", () => {
    expect(isViewableDocument(".jpeg", "ready")).toBe(false);
  });

  it("returns false for gif with ready status", () => {
    expect(isViewableDocument(".gif", "ready")).toBe(false);
  });

  it("returns false for bmp with ready status", () => {
    expect(isViewableDocument(".bmp", "ready")).toBe(false);
  });

  it("returns false for tiff with ready status", () => {
    expect(isViewableDocument(".tiff", "ready")).toBe(false);
  });

  it("returns false for tif with ready status", () => {
    expect(isViewableDocument(".tif", "ready")).toBe(false);
  });

  it("returns false for pdf with processing status", () => {
    expect(isViewableDocument(".pdf", "processing")).toBe(false);
  });

  it("returns false for pdf with error status", () => {
    expect(isViewableDocument(".pdf", "error")).toBe(false);
  });

  it("handles uppercase file types", () => {
    expect(isViewableDocument(".PDF", "ready")).toBe(true);
    expect(isViewableDocument(".PNG", "ready")).toBe(false);
  });
});

describe("DocumentViewer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is hidden when documentId is null", () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: undefined,
    });
    render(
      <DocumentViewer documentId={null} onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    expect(screen.queryByTestId("document-viewer")).toBeNull();
  });

  it("renders loading skeleton when pending", async () => {
    mockedQuery.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    });
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    expect(await screen.findByTestId("viewer-loading")).toBeTruthy();
  });

  it("renders error state", async () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: true,
      data: undefined,
    });
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    expect(await screen.findByTestId("viewer-error")).toBeTruthy();
    expect(screen.getByText("Failed to load document content.")).toBeTruthy();
  });

  it("renders document content from chunks", async () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "doc-1",
        fileName: "report.pdf",
        chunks: mockChunks,
        totalChunks: 2,
      },
    });
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    expect(await screen.findByTestId("document-content")).toBeTruthy();
    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText(/2 sections/)).toBeTruthy();
    expect(screen.getByText(/Hello world paragraph one/)).toBeTruthy();
    expect(screen.getByText(/Second world section here/)).toBeTruthy();
  });

  it("renders empty content message when no chunks", async () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "doc-1",
        fileName: "empty.pdf",
        chunks: [],
        totalChunks: 0,
      },
    });
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    expect(await screen.findByText("This document has no text content.")).toBeTruthy();
  });

  it("renders 1 section singular", async () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "doc-1",
        fileName: "single.pdf",
        chunks: [mockChunks[0]],
        totalChunks: 1,
      },
    });
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    expect(await screen.findByText(/1 section$/)).toBeTruthy();
  });

  it("search highlights matches and shows count", async () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "doc-1",
        fileName: "report.pdf",
        chunks: mockChunks,
        totalChunks: 2,
      },
    });
    const user = userEvent.setup();
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    await screen.findByTestId("document-content");
    const input = screen.getByTestId("document-search-input");
    await user.type(input, "world");
    const matchCount = await screen.findByTestId("match-count");
    expect(matchCount.textContent).toBe("1 of 2");
    expect(screen.getByTestId("match-0")).toBeTruthy();
    expect(screen.getByTestId("match-1")).toBeTruthy();
  });

  it("shows No matches for non-matching query", async () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "doc-1",
        fileName: "report.pdf",
        chunks: mockChunks,
        totalChunks: 2,
      },
    });
    const user = userEvent.setup();
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    await screen.findByTestId("document-content");
    const input = screen.getByTestId("document-search-input");
    await user.type(input, "zzzznotfound");
    const matchCount = await screen.findByTestId("match-count");
    expect(matchCount.textContent).toBe("No matches");
  });

  it("next/prev buttons cycle through matches", async () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "doc-1",
        fileName: "report.pdf",
        chunks: mockChunks,
        totalChunks: 2,
      },
    });
    const user = userEvent.setup();
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    await screen.findByTestId("document-content");
    const input = screen.getByTestId("document-search-input");
    await user.type(input, "world");
    await screen.findByTestId("match-count");

    expect(screen.getByTestId("match-count").textContent).toBe("1 of 2");

    await user.click(screen.getByTestId("match-next"));
    await waitFor(() =>
      expect(screen.getByTestId("match-count").textContent).toBe("2 of 2"),
    );

    await user.click(screen.getByTestId("match-next"));
    await waitFor(() =>
      expect(screen.getByTestId("match-count").textContent).toBe("1 of 2"),
    );

    await user.click(screen.getByTestId("match-prev"));
    await waitFor(() =>
      expect(screen.getByTestId("match-count").textContent).toBe("2 of 2"),
    );
  });

  it("prev/next are disabled when no matches", async () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "doc-1",
        fileName: "report.pdf",
        chunks: mockChunks,
        totalChunks: 2,
      },
    });
    const user = userEvent.setup();
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    await screen.findByTestId("document-content");
    await user.type(screen.getByTestId("document-search-input"), "zzzznotfound");
    await screen.findByTestId("match-count");
    const prev = screen.getByTestId("match-prev") as HTMLButtonElement;
    const next = screen.getByTestId("match-next") as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });

  it("search is case insensitive", async () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "doc-1",
        fileName: "report.pdf",
        chunks: [{ id: "c1", content: "Hello HELLO hello", chunkIndex: 0, chunkMetadata: null }],
        totalChunks: 1,
      },
    });
    const user = userEvent.setup();
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    await screen.findByTestId("document-content");
    await user.type(screen.getByTestId("document-search-input"), "hello");
    const matchCount = await screen.findByTestId("match-count");
    expect(matchCount.textContent).toBe("1 of 3");
  });

  it("hides search controls when query is empty", async () => {
    mockedQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "doc-1",
        fileName: "report.pdf",
        chunks: mockChunks,
        totalChunks: 2,
      },
    });
    render(
      <DocumentViewer documentId="doc-1" onOpenChange={jest.fn()} />,
      { wrapper: createWrapper() },
    );
    await screen.findByTestId("document-content");
    expect(screen.queryByTestId("match-count")).toBeNull();
    expect(screen.queryByTestId("match-prev")).toBeNull();
    expect(screen.queryByTestId("match-next")).toBeNull();
  });
});
