/// <reference types="@testing-library/jest-dom" />
import { describe, it, jest, beforeEach } from "@jest/globals"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { AgentPanel } from "./agent-panel"
import { useCreateAgent } from "@/mutations/use-create-agent"
import { useCreateAgentWidgetApiKey } from "@/mutations/use-create-agent-widget-api-key"
import { useDeployAgentWidgetSecurity } from "@/mutations/use-deploy-agent-widget-security"
import { useUpdateAgentCustomSystemPrompt } from "@/mutations/use-update-agent-custom-system-prompt"
import { useUpdateAgentFrontendCapability } from "@/mutations/use-update-agent-frontend-capability"
import { useUpdateAgentWidgetInstall } from "@/mutations/use-update-agent-widget-install"
import { useUpdateAgentWidgetConfig } from "@/mutations/use-update-agent-widget-config"
import { useUpdateAgentWidgetSecurityDraft } from "@/mutations/use-update-agent-widget-security-draft"
import { useAgentCustomSystemPromptQuery } from "@/queries/use-agent-custom-system-prompt"
import { useAgentQuery } from "@/queries/use-agent"
import { useAgentFrontendCapabilityQuery } from "@/queries/use-agent-frontend-capability"
import { useAgentWidgetConfigQuery } from "@/queries/use-agent-widget-config"
import { useAgentWidgetInstallQuery } from "@/queries/use-agent-widget-install"
import { useAgentWidgetSecurityQuery } from "@/queries/use-agent-widget-security"
import { useConfigQuery } from "@/queries/use-config"
import { useNavigationStore } from "@/stores/navigation"

jest.mock("@/stores/toast", () => {
  const addToast = jest.fn()
  ;(globalThis as unknown as { __toastAddToast?: jest.Mock }).__toastAddToast = addToast
  type ToastState = { addToast: jest.Mock; toasts: unknown[]; removeToast: jest.Mock }
  const toastState: ToastState = { addToast, toasts: [], removeToast: jest.fn() }
  return {
    useToastStore: <T,>(selector: (state: ToastState) => T) => selector(toastState),
    toastSelectors: {
      addToast: (state: ToastState) => state.addToast
    }
  }
})

const getAddToast = () => {
  const addToast = (globalThis as unknown as { __toastAddToast?: jest.Mock }).__toastAddToast
  if (!addToast) throw new Error("addToast mock not initialized")
  return addToast
}

jest.mock("@/queries/use-agent-widget-security", () => ({
  useAgentWidgetSecurityQuery: jest.fn(),
  agentWidgetSecurityQueryKey: ["agent", "widget-security"]
}))

jest.mock("@/queries/use-agent-widget-config", () => ({
  useAgentWidgetConfigQuery: jest.fn(),
  agentWidgetConfigQueryKey: ["agent", "widget-config"]
}))

jest.mock("@/queries/use-agent-widget-install", () => ({
  useAgentWidgetInstallQuery: jest.fn(),
  agentWidgetInstallQueryKey: ["agent", "widget-install"]
}))

jest.mock("@/queries/use-config", () => ({
  useConfigQuery: jest.fn()
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

jest.mock("@/mutations/use-update-agent-widget-config", () => ({
  useUpdateAgentWidgetConfig: jest.fn()
}))

jest.mock("@/mutations/use-update-agent-widget-install", () => ({
  useUpdateAgentWidgetInstall: jest.fn()
}))

jest.mock("@/mutations/use-create-agent-widget-api-key", () => ({
  useCreateAgentWidgetApiKey: jest.fn()
}))

jest.mock("@/mutations/use-deploy-agent-widget-security", () => ({
  useDeployAgentWidgetSecurity: jest.fn()
}))

jest.mock("@/queries/use-agent-custom-system-prompt", () => ({
  useAgentCustomSystemPromptQuery: jest.fn(),
  agentCustomSystemPromptQueryKey: ["agent", "custom-system-prompt"]
}))

jest.mock("@/mutations/use-update-agent-custom-system-prompt", () => ({
  useUpdateAgentCustomSystemPrompt: jest.fn()
}))

jest.mock("@/queries/use-agent-frontend-capability", () => ({
  useAgentFrontendCapabilityQuery: jest.fn(),
  agentFrontendCapabilityQueryKey: ["agent", "frontend-capability"]
}))

jest.mock("@/mutations/use-update-agent-frontend-capability", () => ({
  useUpdateAgentFrontendCapability: jest.fn()
}))

const mockedUseConfigQuery = useConfigQuery as unknown as jest.Mock
const mockedUseAgentQuery = useAgentQuery as unknown as jest.Mock
const mockedUseCreateAgent = useCreateAgent as unknown as jest.Mock
const mockedUseAgentWidgetSecurityQuery = useAgentWidgetSecurityQuery as unknown as jest.Mock
const mockedUseAgentWidgetConfigQuery = useAgentWidgetConfigQuery as unknown as jest.Mock
const mockedUseAgentWidgetInstallQuery = useAgentWidgetInstallQuery as unknown as jest.Mock
const mockedUseUpdateAgentWidgetSecurityDraft = useUpdateAgentWidgetSecurityDraft as unknown as jest.Mock
const mockedUseCreateAgentWidgetApiKey = useCreateAgentWidgetApiKey as unknown as jest.Mock
const mockedUseDeployAgentWidgetSecurity = useDeployAgentWidgetSecurity as unknown as jest.Mock
const mockedUseUpdateAgentWidgetConfig = useUpdateAgentWidgetConfig as unknown as jest.Mock
const mockedUseUpdateAgentWidgetInstall = useUpdateAgentWidgetInstall as unknown as jest.Mock
const mockedUseAgentCustomSystemPromptQuery = useAgentCustomSystemPromptQuery as unknown as jest.Mock
const mockedUseUpdateAgentCustomSystemPrompt = useUpdateAgentCustomSystemPrompt as unknown as jest.Mock
const mockedUseAgentFrontendCapabilityQuery = useAgentFrontendCapabilityQuery as unknown as jest.Mock
const mockedUseUpdateAgentFrontendCapability = useUpdateAgentFrontendCapability as unknown as jest.Mock

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

const openCustomInstructions = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: /expand custom instructions/i }))
}

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

const baseWidgetConfig = {
  widgetTitle: "Warpy",
  widgetIconUrl: null,
  widgetBehavior: "overlay",
  widgetEmptyTitle: "What would you like to do?",
  widgetEmptyDescription: "Ask a question, request help, or describe what you want to get done.",
  widgetInputPlaceholder: "Ask Warpy…",
  widgetSecurityDisclosureEnabled: true
}

const defaultCustomUserSystemPrompt =
  "You are a helpful copilot for this SaaS product. Help users find features, understand workflows, solve problems, and complete tasks. Be concise, friendly, and proactive. If someone seems stuck, suggest the next best step. Avoid technical jargon unless the user is clearly technical. Offer step-by-step guidance when it would help."

const renderPanelWithInstall = (
  install: { framework: string; packageManager: string },
  baseUrl: Record<string, string> = { local: "http://localhost:3000" }
) => {
  mockedUseConfigQuery.mockReturnValue({
    data: { baseUrl, headers: {} },
    isPending: false
  })
  mockedUseAgentQuery.mockReturnValue({
    data: { id: "agent-123", userId: "user-1" },
    isPending: false,
    error: null
  })
  mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })
  mockedUseAgentWidgetInstallQuery.mockReturnValue({
    data: install,
    isPending: false
  })
  render(<AgentPanel />, { wrapper: createWrapper() })
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
    mockedUseAgentWidgetConfigQuery.mockReturnValue({
      data: baseWidgetConfig,
      isPending: false
    })
    mockedUseUpdateAgentWidgetConfig.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false
    })
    mockedUseAgentWidgetInstallQuery.mockReturnValue({
      data: { framework: "react", packageManager: "npm" },
      isPending: false
    })
    mockedUseUpdateAgentWidgetInstall.mockReturnValue({
      mutate: jest.fn(),
      isPending: false
    })
    mockedUseAgentCustomSystemPromptQuery.mockReturnValue({
      data: { customUserSystemPrompt: defaultCustomUserSystemPrompt },
      isPending: false
    })
    mockedUseUpdateAgentCustomSystemPrompt.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false
    })
    mockedUseAgentFrontendCapabilityQuery.mockReturnValue({
      data: { enabled: true },
      isPending: false
    })
    mockedUseUpdateAgentFrontendCapability.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false
    })
  })

  it("shows loading skeleton when pending", () => {
    mockedUseConfigQuery.mockReturnValue({ data: null, isPending: true })
    mockedUseAgentQuery.mockReturnValue({ data: null, isPending: true, error: null })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(screen.getByTestId("agent-panel-loading")).not.toBeNull()
  })

  it("shows environment tabs and usage", () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost:3000", production: "https://api.example.com" },
        headers: {}
      },
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
    const usageCode = screen.getByTestId("usage-code")
    expect(usageCode.textContent).toContain('agentId="agent-123"')
    expect(screen.getByText("Install")).not.toBeNull()
    expect(screen.getByText("Usage")).not.toBeNull()
    expect(screen.getByText("Configure Widget")).not.toBeNull()
    expect(screen.getByText("Custom Instructions")).not.toBeNull()
    expect(screen.getByText("Advanced Security")).not.toBeNull()
  })

  it.each([
    ["script", "<script src="],
    ["react", "@warpy-ai/widget/react"],
    ["vue", "@warpy-ai/widget/vue"],
    ["angular", "@warpy-ai/widget/angular"],
    ["svelte", "@warpy-ai/widget/svelte"],
    ["vanilla", "mountWidget({"]
  ])("renders %s usage snippet", (framework, expected) => {
    renderPanelWithInstall({ framework, packageManager: "npm" })

    const usageCode = screen.getByTestId("usage-code")
    expect(usageCode.textContent).toContain(expected)
  })

  it.each([
    ["script", "data-base-url="],
    ["react", 'baseUrl="'],
    ["vue", 'baseUrl="'],
    ["angular", 'baseUrl="'],
    ["svelte", 'baseUrl="'],
    ["vanilla", "baseUrl:"]
  ])("omits base url from %s usage snippet when selected environment value is empty", (framework, forbidden) => {
    renderPanelWithInstall({ framework, packageManager: "npm" }, { local: "" })

    const usageCode = screen.getByTestId("usage-code")
    expect(usageCode.textContent).not.toContain(forbidden)
  })

  it.each([
    ["npm", "npm install @warpy-ai/widget"],
    ["pnpm", "pnpm add @warpy-ai/widget"],
    ["yarn", "yarn add @warpy-ai/widget"]
  ])("renders %s install command", (packageManager, expected) => {
    renderPanelWithInstall({ framework: "react", packageManager })

    const installCode = screen.getByTestId("install-code")
    expect(installCode.textContent).toContain(expected)
  })

  it("shows widget config loading state when pending", () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    mockedUseAgentWidgetConfigQuery.mockReturnValue({
      data: null,
      isPending: true
    })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(screen.getByTestId("configure-widget-loading")).not.toBeNull()
  })

  it("shows custom instructions loading state when pending", () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })
    mockedUseAgentCustomSystemPromptQuery.mockReturnValue({
      data: null,
      isPending: true
    })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(screen.getByTestId("custom-system-prompt-loading")).not.toBeNull()
  })

  it("saves custom instructions and shows toast", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => ({
      customUserSystemPrompt: "Be concise and offer next steps."
    }))
    mockedUseUpdateAgentCustomSystemPrompt.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await openCustomInstructions(user)

    const instructionsInput = screen.getByLabelText("Instructions")
    fireEvent.change(instructionsInput, { target: { value: "Be concise and offer next steps." } })
    expect(screen.getByText("Unsaved")).not.toBeNull()
    expect(screen.getByText("32/1500 characters")).not.toBeNull()

    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        customUserSystemPrompt: "Be concise and offer next steps."
      })
      expect(getAddToast()).toHaveBeenCalledWith({
        title: "Saved",
        description: "Custom instructions updated.",
        variant: "success"
      })
    })
  })

  it("restores default custom instructions and discards changes", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })
    mockedUseAgentCustomSystemPromptQuery.mockReturnValue({
      data: { customUserSystemPrompt: "Keep replies short." },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await openCustomInstructions(user)

    const instructionsInput = screen.getByLabelText("Instructions")
    expect((instructionsInput as HTMLTextAreaElement).value).toBe("Keep replies short.")

    await user.click(screen.getByRole("button", { name: /restore defaults/i }))
    expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe(
      defaultCustomUserSystemPrompt
    )

    fireEvent.change(screen.getByLabelText("Instructions"), {
      target: { value: "Always keep it short." }
    })
    expect(screen.getByText("Unsaved")).not.toBeNull()

    await user.click(screen.getByRole("button", { name: /discard changes/i }))
    expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe(
      "Keep replies short."
    )
  })

  it("shows error toast when custom instructions save fails", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => {
      throw new Error("nope")
    })
    mockedUseUpdateAgentCustomSystemPrompt.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await openCustomInstructions(user)

    fireEvent.change(screen.getByLabelText("Instructions"), {
      target: { value: "Be concise and offer next steps." }
    })
    expect(screen.getByLabelText("Instructions")).toHaveAttribute("maxlength", "1500")

    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled()
      expect(getAddToast()).toHaveBeenCalledWith({
        title: "Save failed",
        description: "nope",
        variant: "error"
      })
    })
  })

  it("saves widget config changes and shows toast", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => baseWidgetConfig)
    mockedUseUpdateAgentWidgetConfig.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByRole("button", { name: /expand configure widget/i }))

    const titleInput = screen.getByLabelText("Widget name")
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0)
    await user.clear(titleInput)
    await user.type(titleInput, "Acme Assistant")
    expect(screen.getByText("Unsaved")).not.toBeNull()
    expect(screen.getByText("Custom")).not.toBeNull()

    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          widgetTitle: "Acme Assistant",
          widgetIconUrl: null
        })
      )
      expect(getAddToast()).toHaveBeenCalledWith({
        title: "Saved",
        description: "Widget configuration updated.",
        variant: "success"
      })
    })
  })

  it("saves blank empty state fields", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => baseWidgetConfig)
    mockedUseUpdateAgentWidgetConfig.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByRole("button", { name: /expand configure widget/i }))

    await user.clear(screen.getByLabelText("Empty state title (optional)"))
    await user.clear(screen.getByLabelText("Empty state description (optional)"))
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          widgetEmptyTitle: "",
          widgetEmptyDescription: ""
        })
      )
    })
  })

  it("saves widget behavior changes", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => ({ ...baseWidgetConfig, widgetBehavior: "push" }))
    mockedUseUpdateAgentWidgetConfig.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByRole("button", { name: /expand configure widget/i }))

    expect(screen.getByRole("radio", { name: /overlay/i })).toHaveAttribute("aria-checked", "true")
    await user.click(screen.getByRole("radio", { name: /push/i }))

    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          widgetBehavior: "push"
        })
      )
    })
  })

  it("moves focus when arrow keys change widget behavior", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
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

    await user.click(screen.getByRole("button", { name: /expand configure widget/i }))

    const overlayOption = screen.getByRole("radio", { name: /overlay/i })
    const pushOption = screen.getByRole("radio", { name: /push/i })

    overlayOption.focus()
    expect(overlayOption).toHaveFocus()

    await user.keyboard("{ArrowLeft}")

    await waitFor(() => {
      expect(pushOption).toHaveAttribute("aria-checked", "true")
      expect(pushOption).toHaveFocus()
    })

    await user.keyboard("{ArrowRight}")

    await waitFor(() => {
      expect(overlayOption).toHaveAttribute("aria-checked", "true")
      expect(overlayOption).toHaveFocus()
    })
  })

  it("shows error toast when widget config save fails", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => {
      throw new Error("nope")
    })
    mockedUseUpdateAgentWidgetConfig.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByRole("button", { name: /expand configure widget/i }))

    const titleInput = screen.getByLabelText("Widget name")
    await user.clear(titleInput)
    await user.type(titleInput, "Acme Assistant")
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled()
      expect(getAddToast()).toHaveBeenCalledWith({
        title: "Save failed",
        description: "nope",
        variant: "error"
      })
    })
  })

  it("restores defaults and discards changes", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
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

    await user.click(screen.getByRole("button", { name: /expand configure widget/i }))

    const titleInput = screen.getByLabelText("Widget name")
    await user.clear(titleInput)
    await user.type(titleInput, "Acme Assistant")
    expect(screen.getByText("Unsaved")).not.toBeNull()

    await user.click(screen.getByRole("button", { name: /restore defaults/i }))
    expect(screen.queryByText("Unsaved")).toBeNull()
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0)
    expect((screen.getByLabelText("Widget name") as HTMLInputElement).value).toBe("Warpy")

    await user.clear(screen.getByLabelText("Widget name"))
    await user.type(screen.getByLabelText("Widget name"), "Acme Assistant")
    expect(screen.getByText("Unsaved")).not.toBeNull()

    await user.click(screen.getByRole("button", { name: /discard changes/i }))
    expect(screen.queryByText("Unsaved")).toBeNull()
    expect((screen.getByLabelText("Widget name") as HTMLInputElement).value).toBe("Warpy")
  })

  it("switches icon mode and saves icon URL", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => baseWidgetConfig)
    mockedUseUpdateAgentWidgetConfig.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByRole("button", { name: /expand configure widget/i }))

    await user.click(screen.getByLabelText("Widget icon mode"))
    await user.click(screen.getByRole("option", { name: "Custom image URL" }))

    const iconUrlInput = screen.getByLabelText("Widget icon URL")
    expect(iconUrlInput).not.toBeDisabled()
    await user.type(iconUrlInput, "https://example.com/icon.png")
    expect(screen.getByText("Custom")).not.toBeNull()
    expect(screen.getByRole("img", { name: "Widget icon" })).toHaveAttribute("src", "https://example.com/icon.png")

    await user.click(screen.getByRole("button", { name: /save changes/i }))
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          widgetIconUrl: "https://example.com/icon.png"
        })
      )
    })

    await user.click(screen.getByLabelText("Widget icon mode"))
    await user.click(screen.getByRole("option", { name: "Default bubble" }))

    expect(screen.getAllByText("Default").length).toBeGreaterThan(0)
    expect(screen.queryByRole("img", { name: "Widget icon" })).toBeNull()
    expect(screen.getByLabelText("Widget icon URL")).toBeDisabled()
  })

  it("switches environment tabs", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost:3000", production: "https://api.example.com" },
        headers: {}
      },
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

    const usageCode = screen.getByTestId("usage-code")
    expect(usageCode.textContent).toContain('baseUrl="https://api.example.com"')
  })

  it("shows copied state when copy button is clicked", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
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

    expect(screen.getByTestId("copy-usage-button")).not.toBeNull()
    await user.click(screen.getByTestId("copy-usage-button"))

    await waitFor(() => {
      expect(screen.getByText("Copied")).not.toBeNull()
    })
  })

  it("persists widget install selections", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutate = jest.fn()
    mockedUseUpdateAgentWidgetInstall.mockReturnValue({
      mutate,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByLabelText("Framework"))
    await user.click(screen.getByRole("option", { name: "Script tag" }))

    expect(mutate).toHaveBeenCalledWith({ framework: "script", packageManager: "npm" })
    await waitFor(() => {
      expect(screen.queryByText("Install")).toBeNull()
    })

    await user.click(screen.getByLabelText("Package manager"))
    await user.click(screen.getByRole("option", { name: "pnpm" }))

    expect(mutate).toHaveBeenCalledWith({ framework: "script", packageManager: "pnpm" })
  })

  it("shows error toast when script copy fails", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
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

    fireEvent.click(screen.getByTestId("copy-usage-button"))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
      expect(getAddToast()).toHaveBeenCalledWith({
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
    mockedUseAgentQuery.mockReturnValue({
      data: null,
      isPending: false,
      error: new Error("Not found")
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: mockMutate, isPending: false })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(mockMutate).toHaveBeenCalled()
  })

  it("stages widget auth when enable button is clicked", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
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
    await user.click(screen.getByRole("button", { name: /enable/i }))
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ requireSignedWidgetToken: true })
    })
  })

  it("generates api key and shows it once", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
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
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const writeText = jest.fn(() => Promise.resolve())
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
      expect(getAddToast()).not.toHaveBeenCalled()
    })
  })

  it("shows error toast when prompt copy fails", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
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
      expect(getAddToast()).toHaveBeenCalledWith({
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

  it("shows screen autopilot panel with enabled toggle", () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(screen.getByText("Screen Autopilot")).not.toBeNull()
    expect(screen.getByLabelText("Toggle screen autopilot")).not.toBeNull()
  })

  it("toggles screen autopilot off and shows toast", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => ({ enabled: false }))
    mockedUseUpdateAgentFrontendCapability.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByLabelText("Toggle screen autopilot"))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ enabled: false })
      expect(getAddToast()).toHaveBeenCalledWith({
        title: "Saved",
        description: "Screen autopilot disabled.",
        variant: "success"
      })
    })
  })

  it("shows error toast when screen autopilot update fails", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })

    const mutateAsync = jest.fn(async () => { throw new Error("nope") })
    mockedUseUpdateAgentFrontendCapability.mockReturnValue({
      mutateAsync,
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<AgentPanel />, { wrapper: createWrapper() })

    await user.click(screen.getByLabelText("Toggle screen autopilot"))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled()
      expect(getAddToast()).toHaveBeenCalledWith({
        title: "Save failed",
        description: "nope",
        variant: "error"
      })
    })
  })

  it("shows screen autopilot loading state", () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: { id: "agent-123", userId: "user-1" },
      isPending: false,
      error: null
    })
    mockedUseCreateAgent.mockReturnValue({ mutate: jest.fn(), isPending: false })
    mockedUseAgentFrontendCapabilityQuery.mockReturnValue({
      data: null,
      isPending: true
    })

    render(<AgentPanel />, { wrapper: createWrapper() })

    expect(screen.getByTestId("frontend-capability-loading")).not.toBeNull()
  })

  it("deploys staged changes when enabled", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost:3000" }, headers: {} },
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
