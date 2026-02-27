/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Shell } from "./shell"
import { useNavigationStore } from "@/stores/navigation"
import { TooltipProvider } from "@/components/ui/tooltip"

jest.mock("@clerk/clerk-react", () => ({
  UserButton: () => <div data-testid="user-btn" />
}))

jest.mock("@/features/dashboard/dashboard-panel", () => ({
  DashboardPanel: () => <div data-testid="dashboard-panel" />
}))

jest.mock("@/features/activity/activity-panel", () => ({
  ActivityPanel: () => <div data-testid="activity-panel" />
}))

jest.mock("@/features/billing/billing-panel", () => ({
  BillingPanel: () => <div data-testid="billing-panel" />
}))

jest.mock("@/features/api-config/api-config-panel", () => ({
  ApiConfigPanel: () => <div data-testid="api-panel" />
}))

jest.mock("@/features/tools/ToolsPanel", () => ({
  ToolsPanel: () => <div data-testid="tools-panel" />
}))

jest.mock("@/features/agent/agent-panel", () => ({
  AgentPanel: () => <div data-testid="agent-panel" />
}))

jest.mock("@/features/contact/contact-panel", () => ({
  ContactPanel: () => <div data-testid="contact-panel" />
}))

const renderShell = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Shell />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

describe("Shell", () => {
  beforeEach(() => {
    useNavigationStore.setState({
      section: "dashboard",
      sidebarCollapsed: false
    })
    window.history.replaceState(null, "", "http://localhost/")
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("navigates between sections and collapses sidebar", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await act(async () => {
      renderShell()
    })

    expect(screen.getByTestId("dashboard-panel")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "User activity" }))
    expect(screen.getByTestId("activity-panel")).not.toBeNull()
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("tab")).toBe("activity")
    })
    await user.click(screen.getByRole("button", { name: "Billing" }))
    expect(screen.getByTestId("billing-panel")).not.toBeNull()
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("tab")).toBe("billing")
    })
    await user.click(screen.getByRole("button", { name: "API config" }))
    expect(screen.getByTestId("api-panel")).not.toBeNull()
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("tab")).toBe("api")
    })
    await user.click(screen.getByRole("button", { name: "Agent" }))
    expect(screen.getByTestId("agent-panel")).not.toBeNull()
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("tab")).toBe("agent")
    })
    await user.click(screen.getByRole("button", { name: "Get Help" }))
    expect(screen.getByTestId("contact-panel")).not.toBeNull()
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("tab")).toBe("contact")
    })
    await user.click(screen.getByRole("button", { name: "Overview" }))
    expect(screen.getByTestId("dashboard-panel")).not.toBeNull()
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("tab")).toBeNull()
    })
    await user.click(screen.getByRole("button", { name: /Collapse sidebar/i }))
    expect(useNavigationStore.getState().sidebarCollapsed).toBe(true)
  })

  it("hydrates section from query string", async () => {
    window.history.replaceState(null, "", "http://localhost/?tab=features")
    await act(async () => {
      renderShell()
    })

    expect(await screen.findByTestId("tools-panel")).not.toBeNull()
  })

  it("shows mobile guard when viewport is small", async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query === "(max-width: 767px)",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true
    })) as unknown as typeof window.matchMedia

    await act(async () => {
      renderShell()
    })

    const guard = screen.getByTestId("mobile-guard")
    expect(guard.className).toContain("fixed")
    expect(guard.className).toContain("inset-0")
    expect(guard.className).toContain("overflow-hidden")
    window.matchMedia = original
  })

  it("handles legacy media listeners and section navigation", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const original = window.matchMedia
    const listeners: Array<(event: { matches: boolean }) => void> = []
    const removeListener = jest.fn()
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: undefined,
      removeEventListener: undefined,
      addListener: (cb: (event: { matches: boolean }) => void) => listeners.push(cb),
      removeListener
    })) as unknown as typeof window.matchMedia

    let unmount: () => void = () => {}
    await act(async () => {
      const rendered = renderShell()
      unmount = rendered.unmount
    })

    await user.click(screen.getByRole("button", { name: "API config" }))
    expect(screen.getByTestId("api-panel")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "Features" }))
    expect(screen.getByTestId("tools-panel")).not.toBeNull()

    await act(async () => {
      listeners[0]?.({ matches: true })
    })
    expect(useNavigationStore.getState().section).toBe("features")
    unmount()
    expect(removeListener).toHaveBeenCalled()
    window.matchMedia = original
  })

  it("blurs sidebar buttons after pointer clicks when collapsed", async () => {
    useNavigationStore.setState({
      section: "dashboard",
      sidebarCollapsed: true
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    await act(async () => {
      renderShell()
    })

    const button = screen.getByRole("button", { name: "API config" })
    await user.click(button)
    expect(document.activeElement).not.toBe(button)
  })
})
