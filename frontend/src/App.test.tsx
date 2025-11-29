/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it, jest } from "@jest/globals"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"

import "@testing-library/jest-dom"
import App from "@/App"
import { useNavigationStore } from "@/stores/navigation"

jest.mock("@clerk/clerk-react", () => ({
  ClerkProvider: ({ children }: any) => <>{children}</>,
  SignedIn: ({ children }: any) => <>{children}</>,
  SignedOut: () => null,
  SignInButton: ({ children }: any) => <button>{children}</button>,
  SignUpButton: ({ children }: any) => <button>{children}</button>,
  UserButton: () => <div data-testid="user-button" />
}))

jest.mock("@/queries/use-config", () => ({
  useConfigQuery: jest.fn(() => ({
    data: { baseUrl: { local: "http://localhost" }, headers: {} },
    isPending: false
  }))
}))

jest.mock("@/queries/use-endpoints", () => ({
  useEndpointsQuery: jest.fn(() => ({
    data: { items: [], total: 0, page: 1, pageSize: 5 },
    isPending: false,
    isFetching: false
  }))
}))

jest.mock("@/queries/use-health", () => ({
  useHealthQuery: jest.fn(() => ({ data: { status: "ok" }, isPending: false }))
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
    useNavigationStore.getState().setSection("base")

    renderApp()

    const headings = await screen.findAllByRole("heading", { name: "Base URLs" })
    expect(headings.length).toBeGreaterThan(0)
    expect(screen.getByText("local")).not.toBeNull()
  })
})
