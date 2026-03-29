import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import "@testing-library/jest-dom"
import { SignedInApp } from "@/components/signed-in-app"
import { useOnboardingStateQuery } from "@/queries/use-onboarding-state"

jest.mock("@/queries/use-onboarding-state", () => ({
  useOnboardingStateQuery: jest.fn()
}))

jest.mock("@/components/shell", () => ({
  Shell: () => <div data-testid="shell">Shell</div>
}))

jest.mock("@/features/onboarding/onboarding-gate", () => ({
  OnboardingGate: ({
    onContinueToDashboard,
    state
  }: {
    onContinueToDashboard: () => void
    state: { nextStep: string }
  }) => (
    <div data-testid="onboarding-gate">
      <div>{state.nextStep}</div>
      <button onClick={onContinueToDashboard}>Continue to dashboard</button>
    </div>
  )
}))

const mockedUseOnboardingStateQuery = useOnboardingStateQuery as unknown as jest.Mock

describe("SignedInApp", () => {
  beforeEach(() => {
    mockedUseOnboardingStateQuery.mockReset()
  })

  it("renders the shell with a light loading overlay while onboarding state is pending", () => {
    mockedUseOnboardingStateQuery.mockReturnValue({ isPending: true, isError: false, data: null })

    render(<SignedInApp />)

    expect(screen.getByTestId("shell")).not.toBeNull()
    expect(screen.getByTestId("signed-in-shell-loading").className).toContain("cursor-progress")
    expect(screen.getByTestId("signed-in-shell-loading").className).not.toContain("pointer-events-none")
    expect(screen.queryByTestId("onboarding-gate")).toBeNull()
  })

  it("renders onboarding instead of the shell", async () => {
    mockedUseOnboardingStateQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { status: "not_started", shouldShow: true, nextStep: "website" }
    })

    render(<SignedInApp />)

    expect(screen.getByTestId("onboarding-gate")).not.toBeNull()
    expect(screen.queryByTestId("shell")).toBeNull()
  })

  it("fails open to the shell when onboarding state errors", () => {
    mockedUseOnboardingStateQuery.mockReturnValue({ isPending: false, isError: true, data: null })

    render(<SignedInApp />)

    expect(screen.getByTestId("shell")).not.toBeNull()
  })

  it("dismisses onboarding after continuing to the dashboard", async () => {
    mockedUseOnboardingStateQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { status: "in_progress", shouldShow: true, nextStep: "baseUrl" }
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<SignedInApp />)

    await user.click(screen.getByRole("button", { name: "Continue to dashboard" }))
    await waitFor(() => expect(screen.getByTestId("shell")).not.toBeNull())
  })
})
