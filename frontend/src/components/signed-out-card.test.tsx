/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it } from "@jest/globals"
import { render, screen } from "@testing-library/react"

import { SignedOutCard, SignedInBoundary } from "./signed-out-card"

jest.mock("@clerk/clerk-react", () => ({
  SignedOut: ({ children }: any) => <>{children}</>,
  SignedIn: ({ children }: any) => <>{children}</>,
  SignInButton: ({ children }: any) => <>{children}</>,
  SignUpButton: ({ children }: any) => <>{children}</>
}))

describe("signed-out views", () => {
  it("renders auth prompts", () => {
    render(<SignedOutCard />)
    expect(screen.getAllByText(/Sign in/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Create account/i).length).toBeGreaterThan(0)
  })

  it("shows children when signed in", () => {
    render(
      <SignedInBoundary>
        <div data-testid="signed-in-child" />
      </SignedInBoundary>
    )
    expect(screen.getByTestId("signed-in-child")).not.toBeNull()
  })
})
