import { describe, it, beforeEach, afterEach, jest } from "@jest/globals"
import "@testing-library/jest-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import App from "@/App"
import { apiClient, configureApiClient } from "@/api/client"
import { jsonResponse, mockFetch } from "@/test/http"

const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return { wrapper, queryClient }
}

describe("App", () => {
  beforeEach(() => {
    configureApiClient({ apiUrl: "http://localhost:8000", apiTimeoutMs: 5000 })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("shows health status and handles counter actions", async () => {
    const fetchMock = mockFetch(jsonResponse({ status: "healthy" }))

    const { wrapper } = createQueryWrapper()
    render(<App />, { wrapper })

    await waitFor(() =>
      expect(screen.getByTestId("health-status")).toHaveTextContent("healthy")
    )

    const counterValue = await screen.findByTestId("counter-value")
    expect(counterValue).toHaveTextContent("0")

    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Increment" }))
    expect(screen.getByTestId("counter-value")).toHaveTextContent("1")

    await user.click(screen.getByRole("button", { name: "Reset" }))
    expect(screen.getByTestId("counter-value")).toHaveTextContent("0")

    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ status: "refreshed" })))

    await user.click(screen.getByRole("button", { name: "Refresh" }))
    await waitFor(() =>
      expect(screen.getByTestId("health-status")).toHaveTextContent("refreshed")
    )

    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({} as { status?: string })))

    await user.click(screen.getByRole("button", { name: "Refresh" }))
    await waitFor(() =>
      expect(screen.getByTestId("health-status")).toHaveTextContent("unknown")
    )
  })

  it("surfaces API errors", async () => {
    jest.spyOn(apiClient, "health").mockRejectedValueOnce(new Error("offline"))

    const { wrapper } = createQueryWrapper()
    render(<App />, { wrapper })

    await waitFor(() =>
      expect(screen.getByTestId("health-status")).toHaveTextContent("offline")
    )
  })
})

