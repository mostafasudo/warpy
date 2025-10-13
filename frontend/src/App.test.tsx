import { ClerkProvider } from "@clerk/clerk-react"
import { describe, it, beforeEach, afterEach, jest } from "@jest/globals"
import "@testing-library/jest-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import App, { AuthPrompt, Dashboard } from "@/App"
import { apiClient, configureApiClient } from "@/api/client"
import { jsonResponse, mockFetch } from "@/test/http"

const createMockClerk = (isSignedIn: boolean) => {
  const session = isSignedIn
    ? {
        id: "sess_123",
        status: "active",
        lastActiveToken: { jwt: { claims: {} } },
        getToken: jest.fn(() => Promise.resolve("token")),
        actor: null,
        factorVerificationAge: null
      }
    : null
  const user = isSignedIn ? { id: "user_123", organizationMemberships: [] } : null
  const organization = null
  const clerk: any = {
    loaded: true,
    client: { signIn: {}, signUp: {}, sessions: [], setActive: jest.fn(), signOut: jest.fn() },
    session,
    user,
    organization,
    addListener: (listener: (state: any) => void) => {
      listener({ client: clerk.client, session: clerk.session, user: clerk.user, organization: clerk.organization })
      return () => {}
    },
    mountUserButton: jest.fn(),
    unmountUserButton: jest.fn(),
    openSignIn: jest.fn(),
    openSignUp: jest.fn(),
    redirectToSignIn: jest.fn(),
    redirectToSignUp: jest.fn(),
    redirectToAfterSignOut: jest.fn(),
    redirectToAfterSignIn: jest.fn(),
    redirectToAfterSignUp: jest.fn(),
    signOut: jest.fn(),
    navigate: jest.fn(),
    handleRedirectCallback: jest.fn(),
    __unstable__updateProps: jest.fn(async () => {}),
    setActive: jest.fn(),
    addOnLoaded: (cb: (value: any) => void) => cb(clerk),
    __internal_getOption: jest.fn()
  }
  return clerk
}

const createInitialState = (clerk: any) => ({
  userId: clerk.user?.id ?? null,
  user: clerk.user,
  sessionId: clerk.session?.id ?? null,
  session: clerk.session,
  sessionStatus: clerk.session?.status ?? null,
  sessionClaims: clerk.session?.lastActiveToken?.jwt?.claims ?? null,
  organization: clerk.organization,
  orgId: clerk.organization?.id ?? null,
  orgRole: null,
  orgPermissions: null,
  orgSlug: clerk.organization?.slug ?? null,
  actor: clerk.session?.actor ?? null,
  factorVerificationAge: clerk.session?.factorVerificationAge ?? null
}) as any

const createProviders = (isSignedIn: boolean) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  })
  const clerk = createMockClerk(isSignedIn)
  const initialState = createInitialState(clerk)
  ;(globalThis as any).Clerk = clerk
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ClerkProvider publishableKey="test" Clerk={clerk} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ClerkProvider>
  )
  return { wrapper, queryClient, clerk }
}

describe("App", () => {
  beforeEach(() => {
    configureApiClient({ apiUrl: "http://localhost:8000", apiTimeoutMs: 5000 })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete (globalThis as any).Clerk
  })

  it("shows health status and handles counter actions", async () => {
    const fetchMock = mockFetch(jsonResponse({ status: "healthy" }))

    const { wrapper, queryClient } = createProviders(true)
    render(<Dashboard />, { wrapper })

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

    queryClient.clear()
  })

  it("surfaces API errors", async () => {
    jest.spyOn(apiClient, "health").mockRejectedValueOnce(new Error("offline"))

    const { wrapper, queryClient } = createProviders(true)
    render(<Dashboard />, { wrapper })

    await waitFor(() =>
      expect(screen.getByTestId("health-status")).toHaveTextContent("offline")
    )

    queryClient.clear()
  })

  it("renders auth prompt when signed out", () => {
    const { wrapper, queryClient } = createProviders(false)
    render(<App />, { wrapper })

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument()

    queryClient.clear()
  })

  it("renders dashboard when signed in", async () => {
    const fetchMock = mockFetch(jsonResponse({ status: "healthy" }))
    const { wrapper, queryClient } = createProviders(true)
    render(<App />, { wrapper })

    await waitFor(() =>
      expect(screen.getByTestId("health-status")).toHaveTextContent("healthy")
    )

    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ status: "refreshed" })))

    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Refresh" }))
    await waitFor(() =>
      expect(screen.getByTestId("health-status")).toHaveTextContent("refreshed")
    )

    queryClient.clear()
  })

  it("shows sign-in controls in auth prompt", () => {
    const { wrapper, queryClient } = createProviders(false)
    render(<AuthPrompt />, { wrapper })

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument()

    queryClient.clear()
  })
})
