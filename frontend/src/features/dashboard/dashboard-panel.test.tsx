/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it, jest, beforeEach } from "@jest/globals"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DashboardPanel } from "./dashboard-panel"
import { useNavigationStore } from "@/stores/navigation"

jest.mock("@/queries/use-config", () => ({
  useConfigQuery: jest.fn()
}))

jest.mock("@/queries/use-features", () => ({
  useFeaturesQuery: jest.fn()
}))

jest.mock("@/queries/use-activity-summary", () => ({
  useActivitySummaryQuery: jest.fn()
}))

const mockedUseConfigQuery = require("@/queries/use-config").useConfigQuery as jest.Mock
const mockedUseFeaturesQuery = require("@/queries/use-features").useFeaturesQuery as jest.Mock
const mockedUseActivitySummaryQuery = require("@/queries/use-activity-summary").useActivitySummaryQuery as jest.Mock

describe("DashboardPanel", () => {
  beforeEach(() => {
    useNavigationStore.setState({ section: "dashboard" })
  })

  it("shows stats and links to sections", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http" }, headers: { auth: { source: "cookies", key: "x" } } },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: [
        { id: "f1", name: "Users", enabledState: "enabled", toolCount: 2, tools: [] },
        { id: "f2", name: "Billing", enabledState: "partial", toolCount: 1, tools: [] }
      ],
      isPending: false
    })
    mockedUseActivitySummaryQuery.mockReturnValue({
      data: { conversationCount: 2, actionCount: 5, hasAnyConversation: true, topActions: [] },
      isPending: false
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<DashboardPanel />)

    const featuresLabel = screen.getByText("Features")
    const featuresCard = featuresLabel.closest("div")?.parentElement?.parentElement
    expect(featuresCard).not.toBeNull()
    expect(within(featuresCard as HTMLElement).getByText("2")).not.toBeNull()
    expect(screen.getByText("3 tools mapped.")).not.toBeNull()

    await user.click(screen.getByRole("button", { name: "View all" }))
    expect(useNavigationStore.getState().section).toBe("activity")

    await user.click(screen.getByRole("button", { name: "Configure API" }))
    expect(useNavigationStore.getState().section).toBe("api")
    await user.click(screen.getByRole("button", { name: "Go to features" }))
    expect(useNavigationStore.getState().section).toBe("features")
    await user.click(screen.getByRole("button", { name: "Go to agent" }))
    expect(useNavigationStore.getState().section).toBe("agent")
  })

  it("uses singular tool when only one mapped", () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: {}, headers: {} },
      isPending: false
    })
    mockedUseFeaturesQuery.mockReturnValue({
      data: [{ id: "f1", name: "Users", enabledState: "enabled", toolCount: 1, tools: [] }],
      isPending: false
    })
    mockedUseActivitySummaryQuery.mockReturnValue({
      data: { conversationCount: 0, actionCount: 0, hasAnyConversation: false, topActions: [] },
      isPending: false
    })

    render(<DashboardPanel />)

    expect(screen.getByText("1 tool mapped.")).not.toBeNull()
  })

  it("renders loading skeletons when pending", () => {
    mockedUseConfigQuery.mockReturnValue({ data: null, isPending: true })
    mockedUseFeaturesQuery.mockReturnValue({ data: null, isPending: true })
    mockedUseActivitySummaryQuery.mockReturnValue({ data: null, isPending: true })

    render(<DashboardPanel />)

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })
})
