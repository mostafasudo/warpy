/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it, jest, beforeEach } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DashboardPanel } from "./dashboard-panel"
import { useNavigationStore } from "@/stores/navigation"

jest.mock("@/queries/use-config", () => ({
  useConfigQuery: jest.fn()
}))

jest.mock("@/queries/use-endpoints", () => ({
  useEndpointsQuery: jest.fn()
}))

const mockedUseConfigQuery = require("@/queries/use-config").useConfigQuery as jest.Mock
const mockedUseEndpointsQuery = require("@/queries/use-endpoints").useEndpointsQuery as jest.Mock

describe("DashboardPanel", () => {
  beforeEach(() => {
    useNavigationStore.setState({ section: "dashboard" })
  })

  it("shows stats and links to sections", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http" }, headers: { auth: { source: "cookies", key: "x" } } },
      isPending: false
    })
    mockedUseEndpointsQuery.mockReturnValue({
      data: { items: [], total: 3, page: 1, pageSize: 5 },
      isPending: false
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<DashboardPanel />)

    expect(screen.getByText("3")).not.toBeNull()
    expect(screen.getAllByText("1").length).toBeGreaterThan(1)

    await user.click(screen.getByRole("button", { name: "Go to base URLs" }))
    expect(useNavigationStore.getState().section).toBe("base")
    await user.click(screen.getByRole("button", { name: "Go to session headers" }))
    expect(useNavigationStore.getState().section).toBe("headers")
    await user.click(screen.getByRole("button", { name: "Go to endpoints" }))
    expect(useNavigationStore.getState().section).toBe("endpoints")
  })

  it("renders loading skeletons when pending", () => {
    mockedUseConfigQuery.mockReturnValue({ data: null, isPending: true })
    mockedUseEndpointsQuery.mockReturnValue({ data: null, isPending: true })

    render(<DashboardPanel />)

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })
})
