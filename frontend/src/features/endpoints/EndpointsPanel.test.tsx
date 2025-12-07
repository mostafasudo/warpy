/// <reference types="@testing-library/jest-dom" />
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { EndpointsPanel } from "./EndpointsPanel"
import { endpointsUiSelectors, useEndpointsUiStore } from "@/stores/endpoints-ui"

jest.mock("@/queries/use-endpoints", () => ({
  useEndpointsQuery: jest.fn()
}))

jest.mock("@/queries/use-delete-endpoint", () => ({
  useDeleteEndpoint: jest.fn()
}))

jest.mock("@/queries/use-create-endpoint", () => ({
  useCreateEndpoint: jest.fn()
}))

jest.mock("@/queries/use-update-endpoint", () => ({
  useUpdateEndpoint: jest.fn()
}))

jest.mock("@/stores/endpoint-builder", () => {
  const state: any = {
    path: "/users",
    method: "GET",
    name: "get_users",
    description: "Fetch users",
    agentEnabled: true,
    pathParams: [],
    headers: [],
    queryParams: [],
    bodyFields: [],
    setPath: jest.fn(),
    setMethod: jest.fn(),
    setName: jest.fn(),
    setDescription: jest.fn(),
    setAgentEnabled: jest.fn(),
    setPathParamFixed: jest.fn(),
    setPathParamDescription: jest.fn(),
    addFlatField: jest.fn(),
    updateFlatField: jest.fn(),
    removeFlatField: jest.fn(),
    addBodyField: jest.fn(),
    updateBodyField: jest.fn(),
    removeBodyField: jest.fn(),
    reset: jest.fn(),
    hydrate: jest.fn()
  }
  const hook = (selector: any) => selector(state)
  hook.getState = () => state
  hook.setState = (partial: any) => {
    const next = typeof partial === "function" ? partial(state) : partial
    Object.assign(state, next)
  }
  return {
    useEndpointBuilderStore: hook,
    endpointBuilderSelectors: {
      path: (s: any) => s.path,
      method: (s: any) => s.method,
      name: (s: any) => s.name,
      description: (s: any) => s.description,
      agentEnabled: (s: any) => s.agentEnabled,
      pathParams: (s: any) => s.pathParams,
      headers: (s: any) => s.headers,
      queryParams: (s: any) => s.queryParams,
      bodyFields: (s: any) => s.bodyFields
    },
    endpointBuilderActions: {
      hydrate: (s: any) => s.hydrate,
      reset: (s: any) => s.reset,
      addFlatField: (s: any) => s.addFlatField,
      updateFlatField: (s: any) => s.updateFlatField,
      removeFlatField: (s: any) => s.removeFlatField,
      addBodyField: (s: any) => s.addBodyField,
      updateBodyField: (s: any) => s.updateBodyField,
      removeBodyField: (s: any) => s.removeBodyField,
      setPathParamDescription: (s: any) => s.setPathParamDescription,
      setPathParamFixed: (s: any) => s.setPathParamFixed,
      setDescription: (s: any) => s.setDescription,
      setName: (s: any) => s.setName,
      setPath: (s: any) => s.setPath,
      setMethod: (s: any) => s.setMethod,
      setAgentEnabled: (s: any) => s.setAgentEnabled
    },
    endpointBuilderUtils: {
      isPrimitiveType: jest.fn(() => true),
      normalizePathInput: jest.fn((value: string) => value),
      extractPathParams: jest.fn(() => [])
    }
  }
})

jest.mock("@/stores/toast", () => {
  const addToast = jest.fn()
  return {
    useToastStore: (selector: any) => selector({ addToast, toasts: [], removeToast: jest.fn() }),
    toastSelectors: { addToast: (state: any) => state.addToast }
  }
})

jest.mock("@/lib/tool-schema", () => ({
  buildEndpointPayload: jest.fn(() => ({
    path: "/users",
    method: "GET",
    tool: { type: "function", function: { name: "get_users", description: "desc", parameters: { type: "object", properties: {} } } },
    agentEnabled: true
  })),
  mapEndpointToBuilderState: jest.fn(() => ({
    path: "/users",
    method: "GET",
    name: "get_users",
    description: "desc",
    agentEnabled: true,
    pathParams: [],
    headers: [],
    queryParams: [],
    bodyFields: []
  }))
}))

jest.mock("./validation", () => ({
  validateEndpointState: jest.fn(() => ({
    errors: [],
    invalid: {
      path: false,
      name: false,
      namePattern: false,
      description: false,
      pathParams: [],
      headers: {},
      queryParams: {},
      bodyFields: {}
    }
  }))
}))

jest.mock("./EndpointEditor", () => ({
  EndpointEditor: ({ onSave, onClose, editing }: any) => (
    <div>
      <button data-testid="editor-save" onClick={onSave}>
        Save editor
      </button>
      <button data-testid="editor-close" onClick={onClose}>
        Close editor
      </button>
      <span data-testid="editor-editing">{String(editing)}</span>
    </div>
  )
}))

const mockedUseEndpointsQuery = require("@/queries/use-endpoints").useEndpointsQuery as jest.Mock
const mockedUseDeleteEndpoint = require("@/queries/use-delete-endpoint").useDeleteEndpoint as jest.Mock
const mockedUseCreateEndpoint = require("@/queries/use-create-endpoint").useCreateEndpoint as jest.Mock
const mockedUseUpdateEndpoint = require("@/queries/use-update-endpoint").useUpdateEndpoint as jest.Mock
const validationModule = require("./validation") as { validateEndpointState: jest.Mock }
const toolSchema = require("@/lib/tool-schema") as { buildEndpointPayload: jest.Mock }

const renderPanel = () =>
  render(
    <TooltipProvider>
      <EndpointsPanel />
    </TooltipProvider>
  )

describe("EndpointsPanel", () => {
  beforeEach(() => {
    validationModule.validateEndpointState.mockReturnValue({
      errors: [],
      invalid: {
        path: false,
        name: false,
        namePattern: false,
        description: false,
        pathParams: [],
        headers: {},
        queryParams: {},
        bodyFields: {}
      }
    })
    toolSchema.buildEndpointPayload.mockReturnValue({
      path: "/users",
      method: "GET",
      tool: { type: "function", function: { name: "get_users", description: "desc", parameters: { type: "object", properties: {} } } }
    })
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    useEndpointsUiStore.setState({
      page: 1,
      pageSize: 5,
      editorOpen: false,
      editingId: null,
      search: "",
      searchDraft: "",
      setPage: endpointsUiSelectors.setPage(useEndpointsUiStore.getState()),
      setPageSize: endpointsUiSelectors.setPageSize(useEndpointsUiStore.getState()),
      setSearch: endpointsUiSelectors.setSearch(useEndpointsUiStore.getState()),
      setSearchDraft: endpointsUiSelectors.setSearchDraft(useEndpointsUiStore.getState()),
      openCreate: endpointsUiSelectors.openCreate(useEndpointsUiStore.getState()),
      openEdit: endpointsUiSelectors.openEdit(useEndpointsUiStore.getState()),
      closeEditor: endpointsUiSelectors.closeEditor(useEndpointsUiStore.getState())
    })
    mockedUseDeleteEndpoint.mockReturnValue({ mutateAsync: jest.fn(async () => undefined), isPending: false })
    mockedUseCreateEndpoint.mockReturnValue({ mutateAsync: jest.fn(async () => undefined), isPending: false })
    mockedUseUpdateEndpoint.mockReturnValue({ mutateAsync: jest.fn(async () => undefined), isPending: false })
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })

  it("renders skeletons when loading", () => {
    mockedUseEndpointsQuery.mockReturnValue({ data: null, isPending: true, isFetching: false })

    renderPanel()

    expect(screen.getAllByRole("row")).toHaveLength(5)
  })

  it("creates and updates endpoints", async () => {
    const mutateCreate = jest.fn(async (_payload: any) => undefined)
    const mutateUpdate = jest.fn(async (_payload: any) => undefined)
    mockedUseCreateEndpoint.mockReturnValue({ mutateAsync: mutateCreate, isPending: false })
    mockedUseUpdateEndpoint.mockReturnValue({ mutateAsync: mutateUpdate, isPending: false })
    mockedUseEndpointsQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "endpoint-1",
            path: "/users/{id}",
            method: "GET",
            agentEnabled: true,
            tool: {
              type: "function",
              function: { name: "get_user", description: "Fetch user", parameters: { type: "object", properties: {} } }
            }
          }
        ],
        total: 1,
        page: 1,
        pageSize: 5
      },
      isPending: false,
      isFetching: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await screen.findByText("/users/{id}")

    await user.click(screen.getByTestId("new-endpoint"))
    await user.click(screen.getByTestId("editor-save"))
    expect(mutateCreate).toHaveBeenCalled()

    await user.click(screen.getByTestId("edit-endpoint-endpoint-1"))
    await waitFor(() => expect(screen.getByTestId("editor-editing").textContent).toBe("true"))
    await user.click(screen.getByTestId("editor-save"))

    expect(mutateUpdate).toHaveBeenCalledWith({
      id: "endpoint-1",
      payload: expect.objectContaining({ path: "/users" })
    })
  })

  it("deletes endpoints", async () => {
    const mutateDelete = jest.fn(async (_id: string) => undefined)
    mockedUseDeleteEndpoint.mockReturnValue({ mutateAsync: mutateDelete, isPending: false })
    mockedUseEndpointsQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "endpoint-2",
            path: "/orders",
            method: "POST",
            agentEnabled: true,
            tool: {
              type: "function",
              function: { name: "create_order", description: "Create", parameters: { type: "object", properties: {} } }
            }
          }
        ],
        total: 1,
        page: 1,
        pageSize: 5
      },
      isPending: false,
      isFetching: false
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    renderPanel()

    await screen.findByText("/orders")

    await user.click(screen.getByTestId("delete-endpoint-endpoint-2"))
    await user.click(await screen.findByRole("button", { name: "Delete" }))

    expect(mutateDelete).toHaveBeenCalledWith("endpoint-2")
  })

  it("handles pagination and search draft", async () => {
    mockedUseEndpointsQuery.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 5 },
      isPending: false,
      isFetching: false
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    renderPanel()

    await user.type(screen.getByTestId("endpoint-search"), "users")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    expect(useEndpointsUiStore.getState().search).toBe("users")

    await user.click(screen.getByTestId("next-page"))
    expect(useEndpointsUiStore.getState().page).toBe(1)
  })

  it("hides search loader when search is empty", () => {
    mockedUseEndpointsQuery.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 5 },
      isPending: false,
      isFetching: true
    })

    renderPanel()

    expect(screen.queryByTestId("endpoint-search-loading")).toBeNull()
  })

  it("shows search loader when search is active", async () => {
    mockedUseEndpointsQuery.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 5 },
      isPending: false,
      isFetching: true
    })
    useEndpointsUiStore.setState((state) => ({ ...state, search: "users", searchDraft: "users" }))

    renderPanel()

    await screen.findByTestId("endpoint-search-loading")
  })
})
