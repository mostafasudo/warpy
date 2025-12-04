/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it, jest, beforeEach } from "@jest/globals"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { AgentPanel } from "./agent-panel"
import { useNavigationStore } from "@/stores/navigation"

jest.mock("@/queries/use-config", () => ({
  useConfigQuery: jest.fn()
}))

jest.mock("@/queries/use-endpoints", () => ({
  useEndpointsQuery: jest.fn()
}))

jest.mock("@/queries/use-agent", () => ({
  useAgentQuery: jest.fn(),
  agentQueryKey: ["agent"]
}))

jest.mock("@/mutations/use-create-agent", () => ({
  useCreateAgent: jest.fn()
}))

const mockedUseConfigQuery = require("@/queries/use-config").useConfigQuery as jest.Mock
const mockedUseEndpointsQuery = require("@/queries/use-endpoints").useEndpointsQuery as jest.Mock
const mockedUseAgentQuery = require("@/queries/use-agent").useAgentQuery as jest.Mock
const mockedUseCreateAgent = require("@/mutations/use-create-agent").useCreateAgent as jest.Mock

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("AgentPanel", () => {
  beforeEach(() => {
    useNavigationStore.setState({ section: "agent" })
    jest.clearAllMocks()
  })

  it("shows loading skeleton when pending", () => {
    mockedUseConfigQuery.mockReturnValue({ data: null, isPending: true })
    mockedUseEndpointsQuery.mockReturnValue({ data: null, isPending: true })
    mockedUseAgentQuery.mockReturnValue({ data: null, isPending: true, error: null })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })

  it("shows empty state when no endpoints exist", () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost" }, headers: {} },
      isPending: false
    })
    mockedUseEndpointsQuery.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 10 },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-1", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(screen.getByText("Activate Your Agent")).not.toBeNull()
    expect(screen.getByText(/define your endpoints/i)).not.toBeNull()
  })

  it("navigates to endpoints when CTA is clicked", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost" }, headers: {} },
      isPending: false
    })
    mockedUseEndpointsQuery.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 10 },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-1", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByRole("button", { name: /configure endpoints/i }))
    expect(useNavigationStore.getState().section).toBe("endpoints")
  })

  it("shows environment tabs and script when endpoints exist", () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost:3000", production: "https://api.example.com" },
        headers: {}
      },
      isPending: false
    })
    mockedUseEndpointsQuery.mockReturnValue({
      data: { items: [{ id: "1" }], total: 1, page: 1, pageSize: 10 },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(screen.getByText("local")).not.toBeNull()
    expect(screen.getByText("production")).not.toBeNull()
    const scriptCode = screen.getByTestId("script-code")
    expect(scriptCode.textContent).toContain('data-agent-id="agent-123"')
  })

  it("switches environment tabs", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost:3000", production: "https://api.example.com" },
        headers: {}
      },
      isPending: false
    })
    mockedUseEndpointsQuery.mockReturnValue({
      data: { items: [{ id: "1" }], total: 1, page: 1, pageSize: 10 },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByText("production"))

    const scriptCode = screen.getByTestId("script-code")
    expect(scriptCode.textContent).toContain('data-base-url="https://api.example.com"')
  })

  it("shows copied state when copy button is clicked", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseEndpointsQuery.mockReturnValue({
      data: { items: [{ id: "1" }], total: 1, page: 1, pageSize: 10 },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.resolve() },
      writable: true,
      configurable: true
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(screen.getByText("Copy")).not.toBeNull()
    await user.click(screen.getByTestId("copy-script-button"))

    await waitFor(() => {
      expect(screen.getByText("Copied")).not.toBeNull()
    })
  })

  it("creates agent when not found", () => {
    const mockMutate = jest.fn()
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost" }, headers: {} },
      isPending: false
    })
    mockedUseEndpointsQuery.mockReturnValue({
      data: { items: [{ id: "1" }], total: 1, page: 1, pageSize: 10 },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: null,
      isPending: false,
      error: new Error("Not found")
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: mockMutate, isPending: false })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(mockMutate).toHaveBeenCalled()
  })
})

