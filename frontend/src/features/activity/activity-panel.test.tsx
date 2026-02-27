/// <reference types="@testing-library/jest-dom" />
import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ActivityPanel } from "./activity-panel"

jest.mock("@/queries/use-activity-summary", () => ({
  useActivitySummaryQuery: jest.fn()
}))

jest.mock("@/queries/use-activity-conversations", () => ({
  useActivityConversationsInfiniteQuery: jest.fn()
}))

jest.mock("@/queries/use-activity-conversation-detail", () => ({
  useActivityConversationDetailInfiniteQuery: jest.fn()
}))

const mockedSummary = require("@/queries/use-activity-summary").useActivitySummaryQuery as jest.Mock
const mockedConversations = require("@/queries/use-activity-conversations").useActivityConversationsInfiniteQuery as jest.Mock
const mockedDetail = require("@/queries/use-activity-conversation-detail").useActivityConversationDetailInfiniteQuery as jest.Mock

describe("ActivityPanel", () => {
  beforeEach(() => {
    mockedSummary.mockReset()
    mockedConversations.mockReset()
    mockedDetail.mockReset()
  })

  it("renders summary, top actions, and opens conversation detail", async () => {
    mockedSummary.mockReturnValue({
      data: {
        conversationCount: 3,
        actionCount: 10,
        hasAnyConversation: true,
        topActions: [{ feature: "Catalog", action: "Fetch products", count: 4 }]
      },
      isPending: false
    })

    mockedConversations.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "c1-uuid",
                participant: "widget",
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-02T00:00:00Z",
                userMessageCount: 2,
                actionCount: 1
              }
            ],
            nextCursor: null
          }
        ]
      },
      isPending: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })

    mockedDetail.mockImplementation((args: any) => ({
      data: args?.conversationId
        ? {
          pages: [
            {
              id: "c1-uuid",
              participant: "widget",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-02T00:00:00Z",
              messages: [
                { role: "user", content: "Hello", createdAt: "2026-01-02T00:00:00Z" },
                { role: "assistant", content: "Hi there", createdAt: "2026-01-02T00:00:01Z" }
              ],
              nextMessageCursor: null,
              actions: [
                {
                  id: "a1",
                  createdAt: "2026-01-02T00:00:02Z",
                  toolType: "backend",
                  feature: "Catalog",
                  action: "Fetch products",
                  statusCode: 200,
                  error: null,
                  responseBody: { products: [{ id: "p1" }] },
                  request: { params: {}, query: {}, body: { q: "shoes" } }
                }
              ],
              nextActionCursor: null
            }
          ]
        }
        : undefined,
      isPending: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    }))

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ActivityPanel />)

    expect(screen.getByRole("heading", { name: "User activity" })).not.toBeNull()
    expect(screen.getByText("Fetch products")).not.toBeNull()
    expect(screen.getByText("Catalog")).not.toBeNull()
    expect(screen.getByText("3")).not.toBeNull()
    expect(screen.getByText("10")).not.toBeNull()

    await user.click(screen.getByTestId("view-c1-uuid"))
    expect(await screen.findByRole("heading", { name: "Conversation" })).not.toBeNull()
    expect(await screen.findByText("Hello")).not.toBeNull()
    expect(screen.getByText("Fetch products · Catalog")).not.toBeNull()

    await user.click(screen.getByTestId("action-details"))
    expect(screen.getByText(/"q": "shoes"/)).not.toBeNull()
    await user.click(screen.getByTestId("action-response-details"))
    expect(screen.getByText(/"products"/)).not.toBeNull()
  })

  it("shows frontend tool inputs with frontend-specific labels", async () => {
    mockedSummary.mockReturnValue({
      data: {
        conversationCount: 1,
        actionCount: 1,
        hasAnyConversation: true,
        topActions: []
      },
      isPending: false
    })

    mockedConversations.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "c1-uuid",
                participant: "widget",
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-02T00:00:00Z",
                userMessageCount: 2,
                actionCount: 1
              }
            ],
            nextCursor: null
          }
        ]
      },
      isPending: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })

    mockedDetail.mockImplementation((args: any) => ({
      data: args?.conversationId
        ? {
          pages: [
            {
              id: "c1-uuid",
              participant: "widget",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-02T00:00:00Z",
              messages: [
                { role: "user", content: "Open drawer", createdAt: "2026-01-02T00:00:00Z" },
                { role: "assistant", content: "Done", createdAt: "2026-01-02T00:00:01Z" }
              ],
              nextMessageCursor: null,
              actions: [
                {
                  id: "a-frontend-1",
                  createdAt: "2026-01-02T00:00:02Z",
                  toolType: "frontend",
                  feature: "UI",
                  action: "Open drawer",
                  statusCode: 200,
                  error: null,
                  responseBody: {
                    kind: "frontend_tool",
                    tool: "open_drawer",
                    vars: { drawer: "orders" },
                    title: "Warpy - Jarvis for your dashboard",
                    url: "http://localhost:5173/?tab=features",
                    result: { ok: true }
                  },
                  request: {
                    params: { drawer: "orders" },
                    query: { source: "activity" },
                    body: {}
                  }
                }
              ],
              nextActionCursor: null
            }
          ]
        }
        : undefined,
      isPending: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    }))

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ActivityPanel />)

    await user.click(screen.getByTestId("view-c1-uuid"))
    expect(await screen.findByText("Open drawer · UI")).not.toBeNull()
    expect(screen.getByText("Success")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "View inputs" }))
    expect(screen.getByText("Information sent")).not.toBeNull()
    expect(screen.getByText("URL options")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "View tool result" }))
    expect(screen.getByText(/"ok": true/)).not.toBeNull()
    expect(screen.getByText(/"url": "http:\/\/localhost:5173\/\?tab=features"/)).not.toBeNull()
    expect(screen.queryByText(/"kind": "frontend_tool"/)).toBeNull()
    expect(screen.queryByText(/"tool": "open_drawer"/)).toBeNull()
    expect(screen.queryByText(/"vars":/)).toBeNull()
    expect(screen.queryByText(/"title": "Warpy - Jarvis for your dashboard"/)).toBeNull()
  })

  it("shows only issue (no result body) in tool result details for frontend tool errors", async () => {
    mockedSummary.mockReturnValue({
      data: {
        conversationCount: 1,
        actionCount: 1,
        hasAnyConversation: true,
        topActions: []
      },
      isPending: false
    })

    mockedConversations.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "c1-uuid",
                participant: "widget",
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-02T00:00:00Z",
                userMessageCount: 2,
                actionCount: 1
              }
            ],
            nextCursor: null
          }
        ]
      },
      isPending: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })

    mockedDetail.mockImplementation((args: any) => ({
      data: args?.conversationId
        ? {
          pages: [
            {
              id: "c1-uuid",
              participant: "widget",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-02T00:00:00Z",
              messages: [
                { role: "user", content: "Open drawer", createdAt: "2026-01-02T00:00:00Z" },
                { role: "assistant", content: "Done", createdAt: "2026-01-02T00:00:01Z" }
              ],
              nextMessageCursor: null,
              actions: [
                {
                  id: "a-frontend-err-1",
                  createdAt: "2026-01-02T00:00:02Z",
                  toolType: "frontend",
                  feature: "UI",
                  action: "Open drawer",
                  statusCode: 500,
                  error: "Unknown tool: log-name",
                  responseBody: { tool: "log-name" },
                  request: {
                    params: { drawer: "orders" },
                    query: {},
                    body: {}
                  }
                }
              ],
              nextActionCursor: null
            }
          ]
        }
        : undefined,
      isPending: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    }))

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ActivityPanel />)

    await user.click(screen.getByTestId("view-c1-uuid"))
    expect(await screen.findByText("Failed")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "View tool result" }))
    expect(screen.getByText("Issue")).not.toBeNull()
    expect(screen.getByText("Unknown tool: log-name")).not.toBeNull()
    expect(screen.queryByText("Result")).toBeNull()
    expect(screen.queryByText(/"tool": "log-name"/)).toBeNull()
  })

  it("renders screen autopilot actions separately from tool actions", async () => {
    mockedSummary.mockReturnValue({
      data: {
        conversationCount: 1,
        actionCount: 1,
        hasAnyConversation: true,
        topActions: []
      },
      isPending: false
    })

    mockedConversations.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "c1-uuid",
                participant: "widget",
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-02T00:00:00Z",
                userMessageCount: 1,
                actionCount: 1
              }
            ],
            nextCursor: null
          }
        ]
      },
      isPending: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })

    mockedDetail.mockImplementation((args: any) => ({
      data: args?.conversationId
        ? {
          pages: [
            {
              id: "c1-uuid",
              participant: "widget",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-02T00:00:00Z",
              messages: [
                { role: "user", content: "Open menu", createdAt: "2026-01-02T00:00:00Z" },
                { role: "assistant", content: "Done", createdAt: "2026-01-02T00:00:01Z" }
              ],
              nextMessageCursor: null,
              actions: [
                {
                  id: "a-screen-1",
                  createdAt: "2026-01-02T00:00:02Z",
                  toolType: "screen_autopilot",
                  feature: null,
                  action: null,
                  statusCode: 200,
                  error: null,
                  responseBody: null,
                  request: null,
                  frontendGoal: "Open menu",
                  frontendUrl: "https://app.example.com/orders",
                  frontendActions: [{ action: "click", selector: "button[aria-label='Menu']", status: "ok" }]
                }
              ],
              nextActionCursor: null
            }
          ]
        }
        : undefined,
      isPending: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    }))

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ActivityPanel />)

    await user.click(screen.getByTestId("view-c1-uuid"))
    expect(await screen.findByText("Screen Autopilot · Open menu")).not.toBeNull()
    expect(screen.getByText("Success")).not.toBeNull()
    await user.click(screen.getByTestId("action-details"))
    expect(screen.getByText("click")).not.toBeNull()
  })

  it("shows global empty state when no activity", () => {
    mockedSummary.mockReturnValue({
      data: { conversationCount: 0, actionCount: 0, hasAnyConversation: false, topActions: [] },
      isPending: false
    })
    mockedConversations.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }] },
      isPending: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })
    mockedDetail.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })

    render(<ActivityPanel />)

    expect(screen.getByRole("heading", { name: "No activity yet" })).not.toBeNull()
    expect(screen.getByText("Once your agent starts interacting with users, you’ll see their conversations and actions here.")).not.toBeNull()
    expect(screen.getByRole("button", { name: /agent setup/i })).not.toBeNull()

    expect(screen.queryByText("Conversations")).toBeNull()
    expect(screen.queryByText("Actions")).toBeNull()
    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("does not show global empty state when activity exists outside range", () => {
    mockedSummary.mockReturnValue({
      data: { conversationCount: 0, actionCount: 0, hasAnyConversation: true, topActions: [] },
      isPending: false
    })
    mockedConversations.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }] },
      isPending: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })
    mockedDetail.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })

    render(<ActivityPanel />)

    expect(screen.queryByRole("heading", { name: "No activity yet" })).toBeNull()
    expect(screen.getByRole("combobox")).not.toBeNull()
  })

  it("shows specific empty states when partial activity", () => {
    mockedSummary.mockReturnValue({
      data: { conversationCount: 5, actionCount: 0, hasAnyConversation: true, topActions: [] },
      isPending: false
    })
    mockedConversations.mockReturnValue({
      data: { pages: [{ items: [{ id: "c1", updatedAt: "2026-01-01", userMessageCount: 1, actionCount: 0 }], nextCursor: null }] },
      isPending: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })
    mockedDetail.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })

    render(<ActivityPanel />)

    expect(screen.getByText("No actions yet")).not.toBeNull()
    expect(screen.getByText("No actions during this time period.")).not.toBeNull()
    // Validation for conversation table presence
    const conversationsElements = screen.getAllByText("Conversations")
    expect(conversationsElements.length).toBeGreaterThan(0)
    expect(screen.getAllByText("Actions").length).toBeGreaterThan(0)
    expect(screen.queryByRole("combobox")).not.toBeNull()
    expect(screen.queryByText("No conversations during this time period.")).toBeNull()
  })

  it("renders custom date pickers and infinite scroll sentinel", async () => {
    mockedSummary.mockReturnValue({
      data: { conversationCount: 10, actionCount: 20, hasAnyConversation: true, topActions: [] },
      isPending: false
    })

    const fetchNextPage = jest.fn()
    mockedConversations.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: "next" }] },
      isPending: false,
      hasNextPage: true,
      fetchNextPage,
      isFetchingNextPage: false
    })
    mockedDetail.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false
    })

    const originalIntersectionObserver = global.IntersectionObserver
    let lastCallback: ((entries: Array<{ isIntersecting: boolean }>, observer: unknown) => void) | null = null

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    try {
      global.IntersectionObserver = class MockIntersectionObserver {
        constructor(callback: any) {
          lastCallback = callback
        }
        observe() { }
        disconnect() { }
      } as any

      render(<ActivityPanel />)

      await user.click(screen.getByRole("combobox"))
      await user.click(await screen.findByRole("option", { name: "Custom" }))

      expect(screen.getByTestId("custom-range")).not.toBeNull()
      expect(screen.queryByTestId("apply-custom")).toBeNull()

      expect(lastCallback).not.toBeNull()
        ; (lastCallback as any)([{ isIntersecting: true }], {})
      expect(fetchNextPage).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole("button", { name: /load more/i })).toBeNull()
    } finally {
      global.IntersectionObserver = originalIntersectionObserver
    }
  })
})
