import { ClerkProvider } from "@clerk/clerk-react"
import { afterEach, beforeAll, beforeEach, describe, it, jest } from "@jest/globals"
import "@testing-library/jest-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import App from "@/App"
import { configureApiClient } from "@/api/client"
import { jsonResponse } from "@/test/http"
import { useConfigUiStore } from "@/stores/config-ui"
import { useEndpointBuilderStore } from "@/stores/endpoint-builder"

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
      queries: { retry: false }
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
  return { wrapper, queryClient }
}

describe("App", () => {
  beforeAll(() => {
    ;(HTMLElement.prototype as any).hasPointerCapture = () => false
    ;(HTMLElement.prototype as any).releasePointerCapture = () => {}
    ;(Element.prototype as any).scrollIntoView = () => {}
  })

  beforeEach(() => {
    configureApiClient({ apiUrl: "http://api.test", apiTimeoutMs: 5000 })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete (globalThis as any).Clerk
  })

  it("renders auth prompt when signed out", () => {
    const { wrapper, queryClient } = createProviders(false)
    render(<App />, { wrapper })

    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument()

    queryClient.clear()
  })

  it("manages base urls and session headers", async () => {
    const { wrapper, queryClient } = createProviders(true)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const configState = { baseUrl: { local: "http://localhost", production: "https://api" }, headers: {} }
    let lastConfigPayload: any = null

    jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(async (input, init) => {
        const url = input instanceof URL ? input : new URL(input as string)
        const method = init?.method ?? "GET"
        if (url.pathname === "/health") {
          return jsonResponse({ status: "ok" })
        }
        if (url.pathname === "/config" && method === "GET") {
          return jsonResponse(configState)
        }
        if (url.pathname === "/config" && method === "PUT") {
          lastConfigPayload = JSON.parse(String(init?.body))
          configState.baseUrl = lastConfigPayload.baseUrl
          configState.headers = lastConfigPayload.headers
          return jsonResponse(lastConfigPayload)
        }
        throw new Error(`Unhandled request ${method} ${url.pathname}`)
      })

    render(<App />, { wrapper })

    await screen.findByText(/ok/i)
    await screen.findByRole("heading", { name: "Base URLs" })
    await screen.findByText("local")

    await user.clear(screen.getByTestId("base-env-input"))
    await user.type(screen.getByTestId("base-env-input"), "staging")
    await user.clear(screen.getByTestId("base-url-input"))
    await user.type(screen.getByTestId("base-url-input"), "https://staging.test")
    await user.click(screen.getByTestId("save-base-env"))

    await screen.findByText("staging")

    await user.click(screen.getByText("Session Headers"))
    await screen.findByRole("heading", { name: "Session Headers" })

    await user.clear(screen.getByTestId("header-name-input"))
    await user.type(screen.getByTestId("header-name-input"), "authToken")
    await act(async () => {
      useConfigUiStore.getState().setHeaderForm({ source: "sessionStorage" })
    })
    await user.clear(screen.getByTestId("header-key-input"))
    await user.type(screen.getByTestId("header-key-input"), "authorization")
    await user.click(screen.getByTestId("save-header"))

    await screen.findByText("authToken")
    expect(lastConfigPayload.baseUrl.staging).toBe("https://staging.test")
    expect(lastConfigPayload.headers.authToken).toEqual({ source: "sessionStorage", key: "authorization" })

    queryClient.clear()
  })

  it("edits endpoints and builds tool schema", async () => {
    const { wrapper, queryClient } = createProviders(true)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const existingEndpoint = {
      id: "endpoint-1",
      path: "/users/{id}",
      method: "GET",
      tool: {
        type: "function",
        function: {
          name: "get_user",
          description: "Fetch a user",
          parameters: {
            type: "object",
            properties: {
              params: {
                type: "object",
                properties: { id: { type: "string", description: "pass always as 99" } },
                required: ["id"]
              },
              headers: {
                type: "object",
                properties: { locale: { type: "string" } },
                required: ["locale"]
              },
              query: {
                type: "object",
                properties: { verbose: { type: "boolean" } },
                required: []
              },
              body: {
                type: "object",
                properties: {
                  meta: {
                    type: "object",
                    properties: { label: { type: "string" } },
                    required: []
                  }
                },
                required: []
              }
            },
            required: ["params", "headers"]
          }
        }
      }
    }

    let lastEndpointPayload: any = null

    jest
      .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
      .mockImplementation(async (input, init) => {
        const url = input instanceof URL ? input : new URL(input as string)
        const method = init?.method ?? "GET"
        if (url.pathname === "/health") {
          return jsonResponse({ status: "ok" })
        }
        if (url.pathname === "/config" && method === "GET") {
          return jsonResponse({ baseUrl: { local: "http://localhost", production: "https://api" }, headers: {} })
        }
        if (url.pathname === "/endpoints" && method === "GET") {
          return jsonResponse({ items: [existingEndpoint], page: 1, pageSize: 5, total: 1 })
        }
        if (url.pathname === `/endpoints/${existingEndpoint.id}` && method === "PUT") {
          lastEndpointPayload = JSON.parse(String(init?.body))
          existingEndpoint.path = lastEndpointPayload.path
          existingEndpoint.method = lastEndpointPayload.method
          existingEndpoint.tool = lastEndpointPayload.tool
          return jsonResponse({ ...lastEndpointPayload, id: existingEndpoint.id })
        }
        throw new Error(`Unhandled request ${method} ${url.pathname}`)
      })

    render(<App />, { wrapper })

    await screen.findByText(/ok/i)
    await user.click(screen.getByText("Endpoints"))
    await screen.findByText("/users/{id}")

    await user.click(screen.getByTestId(`edit-endpoint-${existingEndpoint.id}`))

    const pathInput = await screen.findByTestId("endpoint-path")
    await waitFor(() => expect(pathInput).toHaveValue("/users/:id"))

    const nameInput = screen.getByTestId("endpoint-name")
    await user.clear(nameInput)
    await user.type(nameInput, "updateOrder")
    const descriptionInput = screen.getByTestId("endpoint-description")
    await user.clear(descriptionInput)
    await user.type(descriptionInput, "Update order")
    const headerId = useEndpointBuilderStore.getState().headers[0].id
    await user.type(screen.getByTestId(`field-${headerId}-description`), "Locale header")

    await user.clear(pathInput)
    await user.type(pathInput, "/users/:id/orders/:orderId")
    await user.type(await screen.findByTestId("path-param-id-description"), "User identifier")

    await act(async () => {
      useEndpointBuilderStore.getState().setMethod("POST")
    })

    await user.click(await screen.findByTestId("path-param-orderId-fixed-toggle"))
    await user.type(screen.getByTestId("path-param-orderId-fixed"), "42")

    const queryAdd = screen.getByTestId("add-query-params")
    await user.click(queryAdd)
    const queryField = screen.getAllByPlaceholderText("Name").at(-1)!
    await user.type(queryField, "include")
    const latestQuery = useEndpointBuilderStore.getState().queryParams.slice(-1)[0]
    await act(async () => {
      useEndpointBuilderStore
        .getState()
        .updateFlatField("queryParams", latestQuery.id, { type: "boolean", required: true })
    })
    await user.type(screen.getByTestId(`field-${latestQuery.id}-description`), "Include additional data")

    await act(async () => {
      useEndpointBuilderStore.setState((state) => ({
        ...state,
        bodyFields: [
          {
            id: "payload",
            name: "payload",
            type: "object",
            required: true,
            description: "",
            children: [
              {
                id: "status",
                name: "status",
                type: "string",
                required: true,
                fixed: "ready",
                description: ""
              }
            ]
          }
        ]
      }))
    })
    const payloadDescription = screen.getByTestId("body-field-payload-description")
    await user.type(payloadDescription, "Payload contents")

    await user.click(screen.getByTestId("save-endpoint"))

    await waitFor(() => expect(lastEndpointPayload).not.toBeNull())
    expect(lastEndpointPayload.path).toBe("/users/{id}/orders/{orderId}")
    expect(lastEndpointPayload.method).toBe("POST")
    expect(lastEndpointPayload.tool.function.name).toBe("updateOrder")
    const params = (lastEndpointPayload.tool.function.parameters as any).properties.params
    expect(params.description).toBe("Path params of the endpoint")
    expect(params.required).toEqual(expect.arrayContaining(["id", "orderId"]))
    expect(params.properties.id.description).toBe("User identifier")
    expect(params.properties.orderId.description).toBe("pass always as 42")
    const headers = (lastEndpointPayload.tool.function.parameters as any).properties.headers
    expect(headers.description).toBe("Headers of the endpoint")
    expect(headers.required).toEqual(expect.arrayContaining(["locale"]))
    expect(headers.properties.locale.description).toBe("Locale header")
    const query = (lastEndpointPayload.tool.function.parameters as any).properties.query
    expect(query.description).toBe("Query params of the endpoint")
    expect(query.required).toEqual(expect.arrayContaining(["include"]))
    expect(query.properties.include.description).toBe("Include additional data")
    const body = (lastEndpointPayload.tool.function.parameters as any).properties.body
    expect(body.description).toBe("Body of the endpoint")
    expect(body.required).toEqual(expect.arrayContaining(["payload"]))
    expect(body.properties.payload.description).toBe("Payload contents")
    expect(body.properties.payload.properties.status.description).toBe("pass always as ready")

    queryClient.clear()
  })
})
