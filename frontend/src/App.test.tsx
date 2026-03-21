import { describe, expect, it, jest } from "@jest/globals"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

import "@testing-library/jest-dom"
import App from "@/App"

jest.mock("@clerk/clerk-react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignedIn: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  SignInButton: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  SignUpButton: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  UserButton: () => <div data-testid="user-button" />,
  useSession: () => ({ session: { id: "sess_1" } })
}))

jest.mock("@/components/signed-in-app", () => ({
  SignedInApp: () => <div data-testid="signed-in-app">Signed in</div>
}))

const renderApp = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  )
}

describe("App", () => {
  it("renders shell when signed in", async () => {
    renderApp()

    expect(await screen.findByTestId("signed-in-app")).not.toBeNull()
  })
})
