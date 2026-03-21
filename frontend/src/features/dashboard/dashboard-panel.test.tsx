/// <reference types="@testing-library/jest-dom" />
import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DashboardPanel } from "./dashboard-panel"
import { useActivitySummaryQuery } from "@/queries/use-activity-summary"
import { useAgentQuery } from "@/queries/use-agent"
import { useConfigQuery } from "@/queries/use-config"
import { useFeaturesQuery } from "@/queries/use-features"
import { useKnowledgeBaseStatusQuery } from "@/queries/use-knowledge-base-status"
import { useNavigationStore } from "@/stores/navigation"

jest.mock("@/queries/use-config", () => ({
  useConfigQuery: jest.fn(),
}))

jest.mock("@/queries/use-features", () => ({
  useFeaturesQuery: jest.fn(),
}))

jest.mock("@/queries/use-activity-summary", () => ({
  useActivitySummaryQuery: jest.fn(),
}))

jest.mock("@/queries/use-agent", () => ({
  useAgentQuery: jest.fn(),
}))

jest.mock("@/queries/use-knowledge-base-status", () => ({
  useKnowledgeBaseStatusQuery: jest.fn(),
}))

const mockedUseConfigQuery = useConfigQuery as jest.Mock
const mockedUseFeaturesQuery = useFeaturesQuery as jest.Mock
const mockedUseActivitySummaryQuery = useActivitySummaryQuery as jest.Mock
const mockedUseAgentQuery = useAgentQuery as jest.Mock
const mockedUseKnowledgeBaseStatusQuery = useKnowledgeBaseStatusQuery as jest.Mock

const makeQuery = (overrides: Record<string, unknown> = {}) => ({
  data: null,
  isPending: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
  ...overrides,
})

const makeFeature = (overrides: Record<string, unknown> = {}) => ({
  id: "feature-1",
  name: "Orders",
  enabledState: "enabled",
  toolCount: 1,
  tools: [],
  ...overrides,
})

const setOverviewMocks = ({
  config = makeQuery({ data: { baseUrl: {}, headers: {} } }),
  features = makeQuery({ data: [] }),
  activity = makeQuery({
    data: { conversationCount: 0, actionCount: 0, hasAnyConversation: false, topActions: [] },
  }),
  agent = makeQuery({ data: { id: "agent-1", userId: "user-1" } }),
  knowledgeBase = makeQuery({ data: { enabled: false, documentCount: 0, readyDocumentCount: 0 } }),
}: {
  config?: Record<string, unknown>
  features?: Record<string, unknown>
  activity?: Record<string, unknown>
  agent?: Record<string, unknown>
  knowledgeBase?: Record<string, unknown>
} = {}) => {
  mockedUseConfigQuery.mockReturnValue(config)
  mockedUseFeaturesQuery.mockReturnValue(features)
  mockedUseActivitySummaryQuery.mockReturnValue(activity)
  mockedUseAgentQuery.mockReturnValue(agent)
  mockedUseKnowledgeBaseStatusQuery.mockReturnValue(knowledgeBase)
}

describe("DashboardPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useNavigationStore.setState({ section: "dashboard", sidebarCollapsed: false })
    setOverviewMocks()
  })

  it("starts with agent setup when the agent does not exist", async () => {
    setOverviewMocks({
      agent: makeQuery({
        data: null,
        isError: true,
        error: new Error("Agent not found"),
      }),
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<DashboardPanel />)

    expect(screen.getByText("Set up your agent first")).not.toBeNull()
    expect(screen.getByText("0/4 core steps complete")).not.toBeNull()
    expect(screen.getByTestId("overview-guided-setup")).not.toBeNull()
    expect(
      within(screen.getByTestId("overview-knowledge-card")).getByText(
        "Optional. Add websites or documents so the agent can answer with your own sources."
      )
    ).not.toBeNull()

    await user.click(within(screen.getByTestId("overview-status-header")).getByRole("button", { name: "Open agent" }))
    expect(useNavigationStore.getState().section).toBe("agent")
  })

  it("pushes environment setup when the agent exists but no base URL is configured", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<DashboardPanel />)

    expect(screen.getByText("Add an environment base URL")).not.toBeNull()
    expect(within(screen.getByTestId("overview-usage-insights")).getByRole("button", { name: "View all activity" })).not.toBeNull()
    await user.click(within(screen.getByTestId("overview-status-header")).getByRole("button", { name: "Add environments" }))
    expect(useNavigationStore.getState().section).toBe("api")
  })

  it("pushes authorization header setup when environments exist but auth is missing", async () => {
    setOverviewMocks({
      config: makeQuery({
        data: {
          baseUrl: { production: "https://api.example.com" },
          headers: { tenant: { source: "cookies", key: "tenant_id" } },
        },
      }),
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<DashboardPanel />)

    expect(screen.getByText("Add an Authorization header next")).not.toBeNull()
    expect(screen.getByText("1 header configured, but Authorization is still missing.")).not.toBeNull()

    await user.click(within(screen.getByTestId("overview-status-header")).getByRole("button", { name: "Add authorization header" }))
    expect(useNavigationStore.getState().section).toBe("api")
  })

  it("pushes feature creation when auth is ready but no features exist", async () => {
    setOverviewMocks({
      config: makeQuery({
        data: {
          baseUrl: { production: "https://api.example.com" },
          headers: { Authorization: { source: "cookies", key: "token", authType: "bearer" } },
        },
      }),
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<DashboardPanel />)

    expect(screen.getByText("Add your first feature")).not.toBeNull()

    await user.click(within(screen.getByTestId("overview-status-header")).getByRole("button", { name: "Add features" }))
    expect(useNavigationStore.getState().section).toBe("features")
  })

  it("pushes action mapping when features exist without mapped actions", async () => {
    setOverviewMocks({
      config: makeQuery({
        data: {
          baseUrl: { production: "https://api.example.com" },
          headers: { Authorization: { source: "cookies", key: "token", authType: "bearer" } },
        },
      }),
      features: makeQuery({
        data: [makeFeature({ toolCount: 0 })],
      }),
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<DashboardPanel />)

    expect(screen.getByText("Map actions inside your features")).not.toBeNull()
    expect(screen.getByText("1 feature added, but no actions are mapped yet.")).not.toBeNull()

    await user.click(within(screen.getByTestId("overview-status-header")).getByRole("button", { name: "Map actions" }))
    expect(useNavigationStore.getState().section).toBe("features")
  })

  it("shows ready-state opportunities when core setup is complete but usage has not started", async () => {
    setOverviewMocks({
      config: makeQuery({
        data: {
          baseUrl: { production: "https://api.example.com" },
          headers: { Authorization: { source: "cookies", key: "token", authType: "bearer" } },
        },
      }),
      features: makeQuery({
        data: [makeFeature({ toolCount: 2 })],
      }),
      knowledgeBase: makeQuery({
        data: { enabled: true, documentCount: 1, readyDocumentCount: 0 },
      }),
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<DashboardPanel />)

    expect(screen.getByText("Your agent is ready for first conversations")).not.toBeNull()
    expect(screen.queryByTestId("overview-guided-setup")).toBeNull()
    expect(screen.getByTestId("overview-opportunities")).not.toBeNull()
    expect(within(screen.getByTestId("overview-opportunities")).getByText("1 knowledge source added and still processing.")).not.toBeNull()

    await user.click(within(screen.getByTestId("overview-status-header")).getByRole("button", { name: "Tune the agent" }))
    expect(useNavigationStore.getState().section).toBe("agent")
  })

  it("encourages more feature work when conversations exist but no actions ran", async () => {
    setOverviewMocks({
      config: makeQuery({
        data: {
          baseUrl: { production: "https://api.example.com" },
          headers: { Authorization: { source: "cookies", key: "token", authType: "bearer" } },
        },
      }),
      features: makeQuery({
        data: [makeFeature({ toolCount: 2 })],
      }),
      activity: makeQuery({
        data: { conversationCount: 3, actionCount: 0, hasAnyConversation: true, topActions: [] },
      }),
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<DashboardPanel />)

    expect(screen.getByText("People are chatting, but no actions are running yet")).not.toBeNull()
    expect(screen.getByText("Conversations are starting, but actions are still missing")).not.toBeNull()
    expect(screen.getByText("Conversations are happening, but no action runs have been recorded in the last 30 days.")).not.toBeNull()

    await user.click(within(screen.getByTestId("overview-status-header")).getByRole("button", { name: "Open features" }))
    expect(useNavigationStore.getState().section).toBe("features")
  })

  it("shows early traction copy when conversations and actions are live", async () => {
    setOverviewMocks({
      config: makeQuery({
        data: {
          baseUrl: { production: "https://api.example.com" },
          headers: { Authorization: { source: "cookies", key: "token", authType: "bearer" } },
        },
      }),
      features: makeQuery({
        data: [makeFeature({ toolCount: 2 })],
      }),
      activity: makeQuery({
        data: {
          conversationCount: 5,
          actionCount: 12,
          hasAnyConversation: true,
          topActions: [{ feature: "Orders", action: "Create order", count: 7 }],
        },
      }),
      knowledgeBase: makeQuery({
        data: { enabled: true, documentCount: 0, readyDocumentCount: 0 },
      }),
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<DashboardPanel />)

    expect(screen.getByText("Your agent is live")).not.toBeNull()
    expect(screen.getByText("Early traction is coming in")).not.toBeNull()
    expect(screen.getByText("Create order")).not.toBeNull()
    expect(
      within(screen.getByTestId("overview-top-actions")).getByText(
        "The actions people ask the widget to run most often. Bars compare the actions shown here."
      )
    ).not.toBeNull()
    expect(
      within(screen.getByTestId("overview-opportunities")).getByText(
        "Knowledge base is enabled. Add websites or documents to make it useful."
      )
    ).not.toBeNull()
    expect(within(screen.getByTestId("overview-usage-insights")).queryByRole("button", { name: "View all activity" })).toBeNull()

    await user.click(within(screen.getByTestId("overview-status-header")).getByRole("button", { name: "Review activity" }))
    expect(useNavigationStore.getState().section).toBe("activity")
  })

  it("shows building usage copy for mid-range activity", () => {
    setOverviewMocks({
      config: makeQuery({
        data: {
          baseUrl: { production: "https://api.example.com" },
          headers: { Authorization: { source: "cookies", key: "token", authType: "bearer" } },
        },
      }),
      features: makeQuery({
        data: [makeFeature({ toolCount: 2 })],
      }),
      activity: makeQuery({
        data: {
          conversationCount: 25,
          actionCount: 88,
          hasAnyConversation: true,
          topActions: [{ feature: "Orders", action: "Create order", count: 40 }],
        },
      }),
    })

    render(<DashboardPanel />)

    expect(screen.getByText("Usage is building")).not.toBeNull()
  })

  it("shows strong activity copy for high usage", () => {
    setOverviewMocks({
      config: makeQuery({
        data: {
          baseUrl: { production: "https://api.example.com" },
          headers: { Authorization: { source: "cookies", key: "token", authType: "bearer" } },
        },
      }),
      features: makeQuery({
        data: [makeFeature({ toolCount: 2 })],
      }),
      activity: makeQuery({
        data: {
          conversationCount: 60,
          actionCount: 140,
          hasAnyConversation: true,
          topActions: [{ feature: "Orders", action: "Create order", count: 40 }],
        },
      }),
    })

    render(<DashboardPanel />)

    expect(screen.getByText("Strong activity in the last 30 days")).not.toBeNull()
  })

  it("keeps usage visible when setup queries fail and retries setup sections", async () => {
    const configRefetch = jest.fn()
    const featuresRefetch = jest.fn()
    const agentRefetch = jest.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    setOverviewMocks({
      config: makeQuery({
        data: null,
        isError: true,
        error: new Error("Config failed"),
        refetch: configRefetch,
      }),
      features: makeQuery({
        data: null,
        isError: true,
        error: new Error("Features failed"),
        refetch: featuresRefetch,
      }),
      agent: makeQuery({
        data: null,
        isError: true,
        error: new Error("Agent failed"),
        refetch: agentRefetch,
      }),
      activity: makeQuery({
        data: { conversationCount: 4, actionCount: 9, hasAnyConversation: true, topActions: [] },
      }),
    })

    render(<DashboardPanel />)

    expect(screen.getByText("Could not load setup progress")).not.toBeNull()
    expect(screen.getByText("4")).not.toBeNull()
    await user.click(within(screen.getByTestId("overview-guided-setup")).getByRole("button", { name: "Retry" }))

    expect(agentRefetch).toHaveBeenCalled()
    expect(configRefetch).toHaveBeenCalled()
    expect(featuresRefetch).toHaveBeenCalled()
  })

  it("shows usage error and knowledge-base fallback text independently", async () => {
    const activityRefetch = jest.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    setOverviewMocks({
      config: makeQuery({
        data: {
          baseUrl: { production: "https://api.example.com" },
          headers: { Authorization: { source: "cookies", key: "token", authType: "bearer" } },
        },
      }),
      features: makeQuery({
        data: [makeFeature({ toolCount: 2 })],
      }),
      activity: makeQuery({
        data: null,
        isError: true,
        error: new Error("Activity failed"),
        refetch: activityRefetch,
      }),
      knowledgeBase: makeQuery({
        data: null,
        isError: true,
        error: new Error("Knowledge failed"),
      }),
    })

    render(<DashboardPanel />)

    expect(screen.getByText("Could not load usage insights")).not.toBeNull()
    expect(screen.getAllByText("Knowledge base status is unavailable right now.").length).toBeGreaterThan(0)

    await user.click(within(screen.getByTestId("overview-usage-insights")).getByRole("button", { name: "Retry" }))
    expect(activityRefetch).toHaveBeenCalled()
  })

  it("renders loading states while overview data is pending", () => {
    setOverviewMocks({
      config: makeQuery({ data: null, isPending: true }),
      features: makeQuery({ data: null, isPending: true }),
      activity: makeQuery({ data: null, isPending: true }),
      agent: makeQuery({ data: null, isPending: true }),
      knowledgeBase: makeQuery({ data: null, isPending: true }),
    })

    render(<DashboardPanel />)

    expect(screen.getByTestId("overview-setup-loading")).not.toBeNull()
    expect(screen.getByTestId("overview-snapshot-loading")).not.toBeNull()
    expect(screen.getByTestId("overview-usage-loading")).not.toBeNull()
  })
})
