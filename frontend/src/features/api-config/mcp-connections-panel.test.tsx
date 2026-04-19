/// <reference types="@testing-library/jest-dom" />
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { McpConnectionsPanel } from "./mcp-connections-panel"
import { useCreateMcpConnection } from "@/queries/use-create-mcp-connection"
import { useDeleteMcpConnection } from "@/queries/use-delete-mcp-connection"
import { useMcpConnectionsQuery } from "@/queries/use-mcp-connections"
import { useUpdateMcpConnection } from "@/queries/use-update-mcp-connection"

const addToastMock = jest.fn()

jest.mock("@/queries/use-mcp-connections", () => ({
  useMcpConnectionsQuery: jest.fn(),
}))

jest.mock("@/queries/use-create-mcp-connection", () => ({
  useCreateMcpConnection: jest.fn(),
}))

jest.mock("@/queries/use-update-mcp-connection", () => ({
  useUpdateMcpConnection: jest.fn(),
}))

jest.mock("@/queries/use-delete-mcp-connection", () => ({
  useDeleteMcpConnection: jest.fn(),
}))

jest.mock("@/stores/toast", () => {
  type ToastState = { addToast: jest.Mock; toasts: unknown[]; removeToast: jest.Mock }
  return {
    useToastStore: <T,>(selector: (state: ToastState) => T) =>
      selector({ addToast: addToastMock, toasts: [], removeToast: jest.fn() }),
    toastSelectors: {
      addToast: (state: ToastState) => state.addToast,
    },
  }
})

const mockedUseMcpConnectionsQuery = useMcpConnectionsQuery as unknown as jest.Mock
const mockedUseCreateMcpConnection = useCreateMcpConnection as unknown as jest.Mock
const mockedUseUpdateMcpConnection = useUpdateMcpConnection as unknown as jest.Mock
const mockedUseDeleteMcpConnection = useDeleteMcpConnection as unknown as jest.Mock

const renderPanel = () =>
  render(
    <TooltipProvider>
      <McpConnectionsPanel />
    </TooltipProvider>
  )

describe("McpConnectionsPanel", () => {
  beforeEach(() => {
    mockedUseCreateMcpConnection.mockReturnValue({ mutateAsync: jest.fn(async (payload) => payload), isPending: false })
    mockedUseUpdateMcpConnection.mockReturnValue({ mutateAsync: jest.fn(async (payload) => payload), isPending: false })
    mockedUseDeleteMcpConnection.mockReturnValue({ mutateAsync: jest.fn(async (payload) => payload), isPending: false })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it("renders saved connections", () => {
    mockedUseMcpConnectionsQuery.mockReturnValue({
      data: [
        {
          id: "conn-1",
          name: "Stripe MCP",
          serverUrl: "https://mcp.example.com",
          authMode: "token_exchange",
          tokenExchangePath: "/api/mcp/token-exchange",
        },
      ],
      isPending: false,
    })

    renderPanel()

    expect(screen.getByText("Stripe MCP")).not.toBeNull()
    expect(screen.getByText("Token exchange")).not.toBeNull()
    expect(screen.getByText("/api/mcp/token-exchange")).not.toBeNull()
  })

  it("creates a static-header connection", async () => {
    const mutateAsync = jest.fn(async (payload) => payload)
    mockedUseCreateMcpConnection.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseMcpConnectionsQuery.mockReturnValue({ data: [], isPending: false })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await user.click(screen.getByTestId("open-mcp-dialog"))
    await user.type(screen.getByTestId("mcp-name-input"), "Linear")
    await user.type(screen.getByTestId("mcp-server-url-input"), "https://linear.example.com/mcp")
    await user.click(screen.getByTestId("mcp-auth-mode-trigger"))
    await user.click(await screen.findByRole("option", { name: "Static headers" }))
    await user.click(screen.getByTestId("add-mcp-static-header"))

    const nameInput = screen.getAllByPlaceholderText("Header name")[0] as HTMLInputElement
    const valueInput = screen.getAllByPlaceholderText("Header value")[0] as HTMLInputElement
    await user.type(nameInput, "Authorization")
    await user.type(valueInput, "Bearer secret")
    await user.click(screen.getByTestId("save-mcp-connection"))

    expect(mutateAsync).toHaveBeenCalledWith({
      name: "Linear",
      serverUrl: "https://linear.example.com/mcp",
      authMode: "static_headers",
      staticHeaders: { Authorization: "Bearer secret" },
      tokenExchangePath: null,
    })
  })

  it("normalizes a bare MCP server host to https before saving", async () => {
    const mutateAsync = jest.fn(async (payload) => payload)
    mockedUseCreateMcpConnection.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseMcpConnectionsQuery.mockReturnValue({ data: [], isPending: false })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await user.click(screen.getByTestId("open-mcp-dialog"))
    await user.type(screen.getByTestId("mcp-name-input"), "Stripe")
    await user.type(screen.getByTestId("mcp-server-url-input"), "example.com")
    await user.click(screen.getByTestId("save-mcp-connection"))

    expect(mutateAsync).toHaveBeenCalledWith({
      name: "Stripe",
      serverUrl: "https://example.com",
      authMode: "none",
      staticHeaders: null,
      tokenExchangePath: null,
    })
  })
})
