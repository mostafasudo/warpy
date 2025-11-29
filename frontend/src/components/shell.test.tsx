/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen } from "@testing-library/react"
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

jest.mock("@/features/base-urls/base-urls-panel", () => ({
  BaseUrlsPanel: () => <div data-testid="base-panel" />
}))

jest.mock("@/features/session-headers/session-headers-panel", () => ({
  SessionHeadersPanel: () => <div data-testid="headers-panel" />
}))

jest.mock("@/features/endpoints/EndpointsPanel", () => ({
  EndpointsPanel: () => <div data-testid="endpoints-panel" />
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
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("navigates between sections and collapses sidebar", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await act(async () => {
      renderShell()
    })

    expect(screen.getByText("API configuration")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "Base URLs" }))
    expect(screen.getAllByText("Base URLs").length).toBeGreaterThan(0)
    await user.click(screen.getByRole("button", { name: /Collapse sidebar/i }))
    expect(useNavigationStore.getState().sidebarCollapsed).toBe(true)
  })

  it("shows mobile guard when viewport is small", () => {
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

    renderShell()

    expect(screen.getByTestId("mobile-guard")).not.toBeNull()
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
      addListener: (cb: any) => listeners.push(cb),
      removeListener
    })) as unknown as typeof window.matchMedia

    let unmount: () => void = () => {}
    await act(async () => {
      const rendered = renderShell()
      unmount = rendered.unmount
    })

    await user.click(screen.getByRole("button", { name: "Session Headers" }))
    expect(screen.getByTestId("headers-panel")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "Endpoints" }))
    expect(screen.getByTestId("endpoints-panel")).not.toBeNull()

    listeners[0]?.({ matches: true })
    expect(useNavigationStore.getState().section).toBe("endpoints")
    unmount()
    expect(removeListener).toHaveBeenCalled()
    window.matchMedia = original
  })
})
