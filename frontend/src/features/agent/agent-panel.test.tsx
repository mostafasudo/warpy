/// <reference types="@testing-library/jest-dom" />
import { describe, it, jest, beforeEach } from "@jest/globals"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { AgentPanel } from "./agent-panel"
import { useNavigationStore } from "@/stores/navigation"

var addToast: jest.Mock

jest.mock("@/stores/toast", () => {
  addToast = jest.fn()
  return {
    useToastStore: (selector: any) => selector({ addToast, toasts: [], removeToast: jest.fn() }),
    toastSelectors: {
      addToast: (state: any) => state.addToast
    }
  }
})

jest.mock("@/queries/use-agent-widget-security", () => ({
  useAgentWidgetSecurityQuery: jest.fn(),
  agentWidgetSecurityQueryKey: ["agent", "widget-security"]
}))

jest.mock("@/queries/use-config", () => ({
  useConfigQuery: jest.fn()
}))

jest.mock("@/queries/use-features", () => ({
  useFeaturesQuery: jest.fn()
}))

jest.mock("@/queries/use-agent", () => ({
  useAgentQuery: jest.fn(),
  agentQueryKey: ["agent"]
}))

jest.mock("@/mutations/use-create-agent", () => ({
  useCreateAgent: jest.fn()
}))

jest.mock("@/mutations/use-update-agent-widget-security-draft", () => ({
  useUpdateAgentWidgetSecurityDraft: jest.fn()
}))

jest.mock("@/mutations/use-create-agent-widget-api-key", () => ({
  useCreateAgentWidgetApiKey: jest.fn()
}))

jest.mock("@/mutations/use-deploy-agent-widget-security", () => ({
  useDeployAgentWidgetSecurity: jest.fn()
}))

const mockedUseConfigQuery = require("@/queries/use-config").useConfigQuery as jest.Mock
const mockedUseFeaturesQuery = require("@/queries/use-features").useFeaturesQuery as jest.Mock
const mockedUseAgentQuery = require("@/queries/use-agent").useAgentQuery as jest.Mock
const mockedUseCreateAgent = require("@/mutations/use-create-agent").useCreateAgent as jest.Mock
const mockedUseAgentWidgetSecurityQuery = require("@/queries/use-agent-widget-security")
  .useAgentWidgetSecurityQuery as jest.Mock
const mockedUseUpdateAgentWidgetSecurityDraft = require("@/mutations/use-update-agent-widget-security-draft")
  .useUpdateAgentWidgetSecurityDraft as jest.Mock
const mockedUseCreateAgentWidgetApiKey = require("@/mutations/use-create-agent-widget-api-key")
  .useCreateAgentWidgetApiKey as jest.Mock
const mockedUseDeployAgentWidgetSecurity = require("@/mutations/use-deploy-agent-widget-security")
  .useDeployAgentWidgetSecurity as jest.Mock

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const openAdvancedSecurity = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: /expand advanced security/i }))
}

const baseFeatures = [
  { id: "f1", name: "Users", enabledState: "enabled", endpointCount: 1, endpoints: [] }
]

const baseWidgetSecurity = {
  active: {
    requireSignedWidgetToken: false,
    widgetRefreshEndpointPath: "/widget-token",
    hasApiKey: false,
    apiKeyLast4: null
  },
  draft: null,
  hasStagedChanges: false
}

describe("AgentPanel", () => {
  beforeEach(() => {
    useNavigationStore.setState({ section: "agent" })
    jest.clearAllMocks()
    mockedUseAgentWidgetSecurityQuery.mockReturnValue({
      data: baseWidgetSecurity,
      isPending: false
    })
    mockedUseUpdateAgentWidgetSecurityDraft.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false
    })
    mockedUseCreateAgentWidgetApiKey.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false
    })
    mockedUseDeployAgentWidgetSecurity.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false
    })
  })

  it("shows loading skeleton when pending", () => {
    mockedUseConfigQuery.mockReturnValue({ data: null, isPending: true })
    mockedUseFeaturesQuery.mockReturnValue({ data: null, isPending: true })
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
    mockedUseFeaturesQuery.mockReturnValue({
      data: [],
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
    mockedUseFeaturesQuery.mockReturnValue({ data: [], isPending: false })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-1", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByRole("button", { name: /configure features/i }))
    expect(useNavigationStore.getState().section).toBe("features")
  })

  it("shows environment tabs and script when endpoints exist", () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost:3000", production: "https://api.example.com" },
        headers: {}
      },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
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
    expect(screen.getByText("Advanced Security")).not.toBeNull()
  })

  it("switches environment tabs", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost:3000", production: "https://api.example.com" },
        headers: {}
      },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
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
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
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

  it("shows error toast when script copy fails", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const writeText = jest.fn(() => Promise.reject(new Error("denied")))
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true
    })
    expect(navigator.clipboard.writeText).toBe(writeText)
    expect(window.navigator.clipboard.writeText).toBe(writeText)

    render(<AgentPanel />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByTestId("copy-script-button"))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
      expect(addToast).toHaveBeenCalledWith({
        title: "Copy failed",
        description: "Could not copy to clipboard.",
        variant: "error"
      })
    })
  })

  it("creates agent when not found", () => {
    const mockMutate = jest.fn()
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost" }, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({ data: baseFeatures, isPending: false })
    mockedUseAgentQuery.mockReturnValue({
      data: null,
      isPending: false,
      error: new Error("Not found")
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: mockMutate, isPending: false })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(mockMutate).toHaveBeenCalled()
  })

  it("stages widget auth when toggle is clicked", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => ({
      ...baseWidgetSecurity,
      draft: { requireSignedWidgetToken: true, widgetRefreshEndpointPath: null, apiKeyLast4: null },
      hasStagedChanges: true
    }))
    mockedUseUpdateAgentWidgetSecurityDraft.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await openAdvancedSecurity(user)
    await user.click(screen.getByRole("switch"))
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ requireSignedWidgetToken: true })
    })
  })

  it("generates api key and shows it once", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    mockedUseAgentWidgetSecurityQuery.mockReturnValue({
      data: {
        ...baseWidgetSecurity,
        active: {
          ...baseWidgetSecurity.active,
          hasApiKey: true,
          apiKeyLast4: "9999"
        }
      },
      isPending: false
    })

    const mutateAsync = jest.fn(async () => ({ apiKey: "wgt_key_1234", apiKeyLast4: "1234" }))
    mockedUseCreateAgentWidgetApiKey.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.resolve() },
      writable: true,
      configurable: true
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await openAdvancedSecurity(user)
    expect(await screen.findByDisplayValue("••••••••••••9999")).not.toBeNull()
    expect(screen.queryByLabelText("Copy masked API key")).toBeNull()

    await user.click(screen.getByRole("button", { name: /rotate/i }))
    expect(mutateAsync).toHaveBeenCalled()

    const apiKeyTextarea = await screen.findByDisplayValue("wgt_key_1234")
    expect(apiKeyTextarea).toHaveClass("resize-none")
    expect(apiKeyTextarea).toHaveClass("h-10")
    expect(apiKeyTextarea).toHaveAttribute("rows", "1")
    expect(screen.queryByDisplayValue("••••••••••••9999")).toBeNull()
    expect(screen.queryByRole("button", { name: /rotate/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /generate key/i })).toBeNull()
    const keyHeader = screen.getByText("Copy your API key")
    const headerContainer = keyHeader.closest("div")
    expect(headerContainer).not.toBeNull()
    const flexContainer = headerContainer?.parentElement
    expect(flexContainer).not.toBeNull()
    expect(within(flexContainer as HTMLElement).getByRole("button", { name: "Copy" })).not.toBeNull()
  })

  it("copies prompt template", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const writeText = jest.fn((_value: string) => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true
    })
    expect(navigator.clipboard.writeText).toBe(writeText)
    expect(window.navigator.clipboard.writeText).toBe(writeText)

    render(<AgentPanel />, { wrapper: createWrapper() })

    await openAdvancedSecurity(user)
    const copyPromptButton = screen.getByRole("button", { name: /copy prompt for coding agent/i })
    expect(copyPromptButton).not.toBeDisabled()
    await user.click(copyPromptButton)
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("POST /widget-token"))
      expect(writeText).toHaveBeenCalledWith(expect.not.stringContaining("{data-base-url}"))
      expect(addToast).not.toHaveBeenCalled()
    })
  })

  it("shows error toast when prompt copy fails", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const writeText = jest.fn(() => Promise.reject(new Error("denied")))
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true
    })
    expect(navigator.clipboard.writeText).toBe(writeText)
    expect(window.navigator.clipboard.writeText).toBe(writeText)

    render(<AgentPanel />, { wrapper: createWrapper() })

    await openAdvancedSecurity(user)
    const copyPromptButton = screen.getByRole("button", { name: /copy prompt for coding agent/i })
    expect(copyPromptButton).not.toBeDisabled()
    await user.click(copyPromptButton)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
      expect(addToast).toHaveBeenCalledWith({
        title: "Copy failed",
        description: "Could not copy to clipboard.",
        variant: "error"
      })
    })
  })

  it("disables deploy button when no staged changes", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    mockedUseAgentWidgetSecurityQuery.mockReturnValue({
      data: baseWidgetSecurity,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await openAdvancedSecurity(user)
    expect(screen.getByRole("button", { name: /deploy changes/i })).toBeDisabled()
  })

  it("stages refresh endpoint path on blur", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => baseWidgetSecurity)
    mockedUseUpdateAgentWidgetSecurityDraft.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await openAdvancedSecurity(user)
    const input = screen.getByLabelText("Widget refresh endpoint path")
    await user.clear(input)
    await user.type(input, "/custom-token")
    await user.tab()

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ widgetRefreshEndpointPath: "/custom-token" })
    })
  })

  it("does not submit invalid refresh endpoint path", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => baseWidgetSecurity)
    mockedUseUpdateAgentWidgetSecurityDraft.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await openAdvancedSecurity(user)
    const input = screen.getByLabelText("Widget refresh endpoint path")
    await user.clear(input)
    await user.type(input, "invalid-path")
    await user.tab()

    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it("deploys staged changes when enabled", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    mockedUseAgentWidgetSecurityQuery.mockReturnValue({
      data: {
        ...baseWidgetSecurity,
        draft: { requireSignedWidgetToken: true, widgetRefreshEndpointPath: null, apiKeyLast4: null },
        hasStagedChanges: true
      },
      isPending: false
    })

    const mutateAsync = jest.fn(async () => baseWidgetSecurity)
    mockedUseDeployAgentWidgetSecurity.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await openAdvancedSecurity(user)
    await user.click(screen.getByRole("button", { name: /deploy changes/i }))
    expect(mutateAsync).toHaveBeenCalled()
  })
})
