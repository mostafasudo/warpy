import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import "@testing-library/jest-dom"
import { buildScriptSnippet, getWidgetCdnUrl } from "@/lib/widget-install"
import { OnboardingGate } from "@/features/onboarding/onboarding-gate"
import { useAddOnboardingWebsite } from "@/mutations/use-add-onboarding-website"
import { useCreateAgent } from "@/mutations/use-create-agent"
import { useFinalizeOnboarding } from "@/mutations/use-finalize-onboarding"
import { useStartOnboarding } from "@/mutations/use-start-onboarding"
import { useAgentQuery } from "@/queries/use-agent"
import { useConfigQuery } from "@/queries/use-config"
import { useKnowledgeWebsitesQuery } from "@/queries/use-knowledge-websites"
import { useSaveConfig } from "@/queries/use-save-config"

jest.mock("@/queries/use-config", () => ({
  useConfigQuery: jest.fn(),
  configQueryKey: ["config"]
}))

jest.mock("@/queries/use-knowledge-websites", () => ({
  useKnowledgeWebsitesQuery: jest.fn(),
  knowledgeWebsitesQueryKey: ["knowledge-websites"]
}))

jest.mock("@/queries/use-agent", () => ({
  useAgentQuery: jest.fn(),
  agentQueryKey: ["agent"]
}))

jest.mock("@/queries/use-save-config", () => ({
  useSaveConfig: jest.fn()
}))

jest.mock("@/queries/use-onboarding-state", () => ({
  onboardingStateQueryKey: ["onboarding-state"]
}))

jest.mock("@/mutations/use-start-onboarding", () => ({
  useStartOnboarding: jest.fn()
}))

jest.mock("@/mutations/use-add-onboarding-website", () => ({
  useAddOnboardingWebsite: jest.fn()
}))

jest.mock("@/mutations/use-create-agent", () => ({
  useCreateAgent: jest.fn()
}))

jest.mock("@/mutations/use-finalize-onboarding", () => ({
  useFinalizeOnboarding: jest.fn()
}))

type ToastState = {
  addToast: jest.Mock
  toasts: unknown[]
  removeToast: jest.Mock
}

jest.mock("@/stores/toast", () => {
  const addToast = jest.fn()
  return {
    useToastStore: (selector: (state: ToastState) => unknown) => selector({ addToast, toasts: [], removeToast: jest.fn() }),
    toastSelectors: {
      addToast: (state: ToastState) => state.addToast
    }
  }
})

const mockedUseConfigQuery = useConfigQuery as unknown as jest.Mock
const mockedUseKnowledgeWebsitesQuery = useKnowledgeWebsitesQuery as unknown as jest.Mock
const mockedUseAgentQuery = useAgentQuery as unknown as jest.Mock
const mockedUseSaveConfig = useSaveConfig as unknown as jest.Mock
const mockedUseStartOnboarding = useStartOnboarding as unknown as jest.Mock
const mockedUseAddOnboardingWebsite = useAddOnboardingWebsite as unknown as jest.Mock
const mockedUseCreateAgent = useCreateAgent as unknown as jest.Mock
const mockedUseFinalizeOnboarding = useFinalizeOnboarding as unknown as jest.Mock

const startOnboardingMutate: jest.Mock = jest.fn()
const addOnboardingWebsiteMutateAsync: jest.Mock = jest.fn()
const createAgentMutate: jest.Mock = jest.fn()
const saveConfigMutateAsync: jest.Mock = jest.fn()
const finalizeOnboardingMutateAsync: jest.Mock = jest.fn()

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const renderGate = (state: { status: "not_started" | "in_progress" | "completed" | "not_applicable"; shouldShow: boolean; nextStep: "website" | "baseUrl" | "auth" | "agent" }) =>
  render(
    <OnboardingGate
      state={state}
      onContinueToDashboard={jest.fn()}
    />,
    { wrapper: createWrapper() }
  )

describe("OnboardingGate", () => {
  beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
      hasPointerCapture: () => false,
      releasePointerCapture: () => undefined,
      scrollIntoView: () => undefined
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()

    startOnboardingMutate.mockReset()
    addOnboardingWebsiteMutateAsync.mockReset()
    createAgentMutate.mockReset()
    saveConfigMutateAsync.mockReset()
    finalizeOnboardingMutateAsync.mockReset()

    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost:3000", production: "" },
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: {}
      },
      isPending: false
    })
    mockedUseKnowledgeWebsitesQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: null,
      isPending: false,
      error: null
    })
    mockedUseStartOnboarding.mockReturnValue({
      mutate: startOnboardingMutate,
      isPending: false
    })
    mockedUseAddOnboardingWebsite.mockReturnValue({
      mutateAsync: addOnboardingWebsiteMutateAsync,
      isPending: false
    })
    mockedUseCreateAgent.mockReturnValue({
      mutate: createAgentMutate,
      isPending: false
    })
    mockedUseSaveConfig.mockReturnValue({
      mutateAsync: saveConfigMutateAsync,
      isPending: false
    })
    mockedUseFinalizeOnboarding.mockReturnValue({
      mutateAsync: finalizeOnboardingMutateAsync,
      isPending: false
    })
  })

  it("saves the onboarding website and advances to the API base URL step", async () => {
    addOnboardingWebsiteMutateAsync.mockImplementation(async () => ({
      id: "website-1",
      inputUrl: "https://example.com",
      scopeUrl: "https://example.com",
      status: "processing"
    }))

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderGate({ status: "not_started", shouldShow: true, nextStep: "website" })

    expect(startOnboardingMutate).toHaveBeenCalledTimes(1)

    await user.type(screen.getByTestId("onboarding-website-input"), "example.com")
    await user.click(screen.getByRole("button", { name: "Continue" }))

    expect(addOnboardingWebsiteMutateAsync).toHaveBeenCalledWith({ url: "example.com" })
    expect(await screen.findByTestId("onboarding-base-url-input")).not.toBeNull()
    expect(screen.getByTestId("onboarding-base-url-input").getAttribute("placeholder")).toBe("api.example.com")
  })

  it("normalizes the production base URL before saving it", async () => {
    saveConfigMutateAsync.mockImplementation(async (payload: unknown) => payload)

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderGate({ status: "in_progress", shouldShow: true, nextStep: "baseUrl" })

    await user.type(screen.getByTestId("onboarding-base-url-input"), "api.example.com")
    await user.click(screen.getByRole("button", { name: "Continue" }))

    expect(saveConfigMutateAsync).toHaveBeenCalledWith({
      baseUrl: {
        local: "http://localhost:3000",
        production: "https://api.example.com"
      },
      auth: { mode: "none" },
      sendCookiesWithRequests: false,
      headers: {}
    })
    expect(await screen.findByTestId("onboarding-auth-header-switch")).not.toBeNull()
  })

  it("stores authorization header auth separately and preserves other session headers", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: {
          local: "http://localhost:3000",
          production: "https://api.example.com"
        },
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: {
          "x-user-id": { source: "cookies", key: "user_id" }
        }
      },
      isPending: false
    })
    saveConfigMutateAsync.mockImplementation(async (payload: unknown) => payload)

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderGate({ status: "in_progress", shouldShow: true, nextStep: "auth" })

    await user.click(screen.getByTestId("onboarding-auth-header-switch"))
    await user.click(screen.getByTestId("onboarding-storage-trigger"))
    await user.click(await screen.findByRole("option", { name: "Session storage" }))
    await user.click(screen.getByTestId("onboarding-auth-type-trigger"))
    await user.click(await screen.findByRole("option", { name: "Basic" }))
    await user.clear(screen.getByTestId("onboarding-token-key-input"))
    await user.type(screen.getByTestId("onboarding-token-key-input"), "session_token")
    await user.click(screen.getByRole("button", { name: "Continue" }))

    expect(saveConfigMutateAsync).toHaveBeenCalledWith({
      baseUrl: {
        local: "http://localhost:3000",
        production: "https://api.example.com"
      },
      auth: { mode: "header", source: "sessionStorage", key: "session_token", authType: "basic" },
      sendCookiesWithRequests: false,
      headers: {
        "x-user-id": { source: "cookies", key: "user_id" }
      }
    })
  })

  it("allows authorization headers to read from cookies during onboarding", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: {
          local: "http://localhost:3000",
          production: "https://api.example.com"
        },
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: {}
      },
      isPending: false
    })
    saveConfigMutateAsync.mockImplementation(async (payload: unknown) => payload)

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderGate({ status: "in_progress", shouldShow: true, nextStep: "auth" })

    await user.click(screen.getByTestId("onboarding-auth-header-switch"))
    await user.click(screen.getByTestId("onboarding-storage-trigger"))
    await user.click(await screen.findByRole("option", { name: "Cookies" }))
    await user.type(screen.getByTestId("onboarding-token-key-input"), "auth_token")
    await user.click(screen.getByRole("button", { name: "Continue" }))

    expect(saveConfigMutateAsync).toHaveBeenCalledWith({
      baseUrl: {
        local: "http://localhost:3000",
        production: "https://api.example.com"
      },
      auth: { mode: "header", source: "cookies", key: "auth_token", authType: "bearer" },
      sendCookiesWithRequests: false,
      headers: {}
    })
  })

  it("stores cookie auth without prompting for a token key", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: {
          local: "http://localhost:3000",
          production: "https://api.example.com"
        },
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: {
          "x-user-id": { source: "cookies", key: "user_id" }
        }
      },
      isPending: false
    })
    saveConfigMutateAsync.mockImplementation(async (payload: unknown) => payload)

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderGate({ status: "in_progress", shouldShow: true, nextStep: "auth" })

    expect(screen.queryByTestId("onboarding-token-key-input")).toBeNull()
    await user.click(screen.getByTestId("onboarding-send-cookies-switch"))

    expect(screen.queryByTestId("onboarding-token-key-input")).toBeNull()
    expect(screen.queryByTestId("onboarding-auth-type-trigger")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Continue" }))

    expect(saveConfigMutateAsync).toHaveBeenCalledWith({
      baseUrl: {
        local: "http://localhost:3000",
        production: "https://api.example.com"
      },
      auth: { mode: "none" },
      sendCookiesWithRequests: true,
      headers: {
        "x-user-id": { source: "cookies", key: "user_id" }
      }
    })
  })

  it("resumes with existing auth values reflected in the form", () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: {
          local: "http://localhost:3000",
          production: "https://api.example.com"
        },
        auth: { mode: "none" },
        sendCookiesWithRequests: true,
        headers: {}
      },
      isPending: false
    })

    renderGate({ status: "in_progress", shouldShow: true, nextStep: "auth" })

    expect(screen.getByTestId("onboarding-send-cookies-switch").getAttribute("data-state")).toBe("checked")
    expect(screen.getByTestId("onboarding-auth-header-switch").getAttribute("data-state")).toBe("unchecked")
    expect(screen.queryByTestId("onboarding-token-key-input")).toBeNull()
    expect(screen.queryByTestId("onboarding-auth-type-trigger")).toBeNull()
  })

  it("renders the agent snippet and only finalizes onboarding when continuing to the dashboard", async () => {
    const agent = {
      id: "agent-123",
      userId: "user-1",
      createdAt: "2026-03-21T00:00:00Z",
      updatedAt: "2026-03-21T00:00:00Z"
    }
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: {
          local: "http://localhost:3000",
          production: "api.example.com"
        },
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: {}
      },
      isPending: false
    })
    mockedUseAgentQuery.mockReturnValue({
      data: agent,
      isPending: false,
      error: null
    })
    finalizeOnboardingMutateAsync.mockImplementation(async () => agent)

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const continueToDashboard = jest.fn()
    const view = render(
      <OnboardingGate
        state={{ status: "in_progress", shouldShow: true, nextStep: "agent" }}
        onContinueToDashboard={continueToDashboard}
      />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(view.container.textContent).toContain("Here's your agent."))
    expect(finalizeOnboardingMutateAsync).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull()
    expect(screen.queryByText("Value")).toBeNull()

    const expectedSnippet = buildScriptSnippet(
      agent.id,
      "api.example.com",
      getWidgetCdnUrl() || `${window.location.origin}/widget/agent.js`
    )
    expect(view.container.textContent).toContain(expectedSnippet)

    await user.click(screen.getByRole("button", { name: "Continue to dashboard" }))

    await waitFor(() => expect(finalizeOnboardingMutateAsync).toHaveBeenCalledTimes(1))
    expect(continueToDashboard).toHaveBeenCalledTimes(1)
  })

  it("lets the user go back from the agent step and still save the website before completion", async () => {
    mockedUseAgentQuery.mockReturnValue({
      data: {
        id: "agent-123",
        userId: "user-1",
        createdAt: "2026-03-21T00:00:00Z",
        updatedAt: "2026-03-21T00:00:00Z"
      },
      isPending: false,
      error: null
    })
    addOnboardingWebsiteMutateAsync.mockImplementation(async () => ({
      id: "website-1",
      inputUrl: "https://example.com",
      scopeUrl: "https://example.com",
      status: "processing"
    }))

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderGate({ status: "in_progress", shouldShow: true, nextStep: "agent" })

    await user.click(screen.getByRole("button", { name: "Back" }))
    await user.click(screen.getByRole("button", { name: "Back" }))
    await user.click(screen.getByRole("button", { name: "Back" }))

    await user.type(screen.getByTestId("onboarding-website-input"), "example.com")
    await user.click(screen.getByRole("button", { name: "Continue" }))

    expect(finalizeOnboardingMutateAsync).not.toHaveBeenCalled()
    expect(addOnboardingWebsiteMutateAsync).toHaveBeenCalledWith({ url: "example.com" })
  })

  it("does not rewind a skipped step when onboarding state refetches an earlier backend step", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const view = render(
      <OnboardingGate
        state={{ status: "in_progress", shouldShow: true, nextStep: "baseUrl" }}
        onContinueToDashboard={jest.fn()}
      />,
      { wrapper: createWrapper() }
    )

    await user.click(screen.getByRole("button", { name: "Skip" }))
    expect(await screen.findByTestId("onboarding-auth-header-switch")).not.toBeNull()

    view.rerender(
      <OnboardingGate
        state={{ status: "in_progress", shouldShow: true, nextStep: "baseUrl" }}
        onContinueToDashboard={jest.fn()}
      />
    )

    expect(screen.queryByTestId("onboarding-base-url-input")).toBeNull()
    expect(screen.getByTestId("onboarding-auth-header-switch")).not.toBeNull()
  })
})
