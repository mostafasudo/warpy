/// <reference types="@testing-library/jest-dom" />
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { useConfigQuery } from "@/queries/use-config"
import { useSaveConfig } from "@/queries/use-save-config"
import { SessionHeadersPanel } from "./session-headers-panel"
import { useConfigUiStore } from "@/stores/config-ui"

const addToastMock = jest.fn()

jest.mock("@/queries/use-config", () => ({
  useConfigQuery: jest.fn()
}))

jest.mock("@/queries/use-save-config", () => ({
  useSaveConfig: jest.fn()
}))

jest.mock("@/stores/toast", () => {
  type ToastState = { addToast: jest.Mock; toasts: unknown[]; removeToast: jest.Mock }
  return {
    useToastStore: <T,>(selector: (state: ToastState) => T) =>
      selector({ addToast: addToastMock, toasts: [], removeToast: jest.fn() }),
    toastSelectors: {
      addToast: (state: ToastState) => state.addToast
    }
  }
})

const mockedUseConfigQuery = useConfigQuery as unknown as jest.Mock
const mockedUseSaveConfig = useSaveConfig as unknown as jest.Mock

const renderPanel = () =>
  render(
    <TooltipProvider>
      <SessionHeadersPanel />
    </TooltipProvider>
  )

describe("SessionHeadersPanel", () => {
  beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
      hasPointerCapture: () => false,
      releasePointerCapture: () => undefined,
      scrollIntoView: () => undefined
    })
  })

  beforeEach(() => {
    useConfigUiStore.getState().resetHeaderForm()
    useConfigUiStore.getState().resetBaseForm()
    useConfigUiStore.getState().setHeaderDialogOpen(false)
    useConfigUiStore.getState().setHeaderSubmitting(false)
    mockedUseSaveConfig.mockReturnValue({
      mutateAsync: jest.fn(async (payload) => payload),
      isPending: false
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it("shows loaders while pending", () => {
    mockedUseConfigQuery.mockReturnValue({ data: null, isPending: true })

    renderPanel()

    expect(screen.getAllByRole("row")).toHaveLength(4)
  })

  it("tracks dirty auth state before enabling save", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost", production: "https://api.example.com" },
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: {}
      },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    expect(screen.queryByTestId("auth-dirty-badge")).toBeNull()
    expect(screen.getByTestId("save-auth-settings").getAttribute("disabled")).not.toBeNull()

    await user.click(screen.getByTestId("send-cookies-switch"))

    expect(screen.getByTestId("auth-dirty-badge")).not.toBeNull()
    expect(screen.getByTestId("save-auth-settings").getAttribute("disabled")).toBeNull()
  })

  it("discards auth changes back to the saved config", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost" },
        auth: { mode: "header", source: "localStorage", key: "token", authType: "bearer" },
        sendCookiesWithRequests: false,
        headers: {}
      },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    expect((screen.getByTestId("auth-key-input") as HTMLInputElement).value).toBe("token")
    expect((screen.getByTestId("send-cookies-switch") as HTMLButtonElement).getAttribute("data-state")).toBe(
      "unchecked"
    )

    await user.clear(screen.getByTestId("auth-key-input"))
    await user.type(screen.getByTestId("auth-key-input"), "next_token")
    await user.click(screen.getByTestId("send-cookies-switch"))

    expect(screen.getByTestId("auth-dirty-badge")).not.toBeNull()

    await user.click(screen.getByTestId("discard-auth-settings"))

    expect(screen.queryByTestId("auth-dirty-badge")).toBeNull()
    expect((screen.getByTestId("auth-key-input") as HTMLInputElement).value).toBe("token")
    expect((screen.getByTestId("send-cookies-switch") as HTMLButtonElement).getAttribute("data-state")).toBe(
      "unchecked"
    )
    expect(screen.getByTestId("save-auth-settings").getAttribute("disabled")).not.toBeNull()
  })

  it("saves header auth settings and the cookie toggle separately from custom headers", async () => {
    const mutateAsync = jest.fn(async (payload) => payload)
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost", production: "https://api.example.com" },
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: { "x-user-id": { source: "cookies", key: "user_id" } }
      },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await user.click(screen.getByTestId("auth-header-switch"))
    await user.click(screen.getByTestId("auth-type-trigger"))
    await user.click(await screen.findByRole("option", { name: "Basic" }))
    await user.click(screen.getByTestId("auth-source-trigger"))
    await user.click(await screen.findByRole("option", { name: "Session storage" }))
    await user.type(screen.getByTestId("auth-key-input"), "session_token")
    await user.click(screen.getByTestId("save-auth-settings"))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost", production: "https://api.example.com" },
      auth: { mode: "header", source: "sessionStorage", key: "session_token", authType: "basic" },
      sendCookiesWithRequests: false,
      headers: { "x-user-id": { source: "cookies", key: "user_id" } }
    })

    await user.click(screen.getByTestId("send-cookies-switch"))
    await user.click(screen.getByTestId("save-auth-settings"))

    expect(mutateAsync).toHaveBeenLastCalledWith({
      baseUrl: { local: "http://localhost", production: "https://api.example.com" },
      auth: { mode: "header", source: "sessionStorage", key: "session_token", authType: "basic" },
      sendCookiesWithRequests: true,
      headers: { "x-user-id": { source: "cookies", key: "user_id" } }
    })
  })

  it("allows Authorization headers to read from cookies when a cookie key is provided", async () => {
    const mutateAsync = jest.fn(async (payload) => payload)
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost", production: "https://api.example.com" },
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: {}
      },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await user.click(screen.getByTestId("auth-header-switch"))
    await user.click(screen.getByTestId("auth-source-trigger"))
    await user.click(await screen.findByRole("option", { name: "Cookies" }))
    await user.type(screen.getByTestId("auth-key-input"), "auth_token")
    await user.click(screen.getByTestId("save-auth-settings"))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost", production: "https://api.example.com" },
      auth: { mode: "header", source: "cookies", key: "auth_token", authType: "bearer" },
      sendCookiesWithRequests: false,
      headers: {}
    })
  })

  it("adds, edits, and deletes custom headers while preserving auth settings", async () => {
    const mutateAsync = jest.fn(async (payload) => payload)
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost" },
        auth: { mode: "header", source: "localStorage", key: "token", authType: "bearer" },
        sendCookiesWithRequests: true,
        headers: { "x-user-id": { source: "cookies", key: "user_id" } }
      },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await screen.findByText("x-user-id")

    await user.click(screen.getByTestId("open-header-dialog"))
    await user.type(screen.getByTestId("header-name-input"), "x-tenant-id")
    await user.type(screen.getByTestId("header-key-input"), "tenant_id")
    await user.click(screen.getByTestId("save-header"))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost" },
      auth: { mode: "header", source: "localStorage", key: "token", authType: "bearer" },
      sendCookiesWithRequests: true,
      headers: {
        "x-user-id": { source: "cookies", key: "user_id" },
        "x-tenant-id": { source: "localStorage", key: "tenant_id" }
      }
    })

    await user.click(screen.getByTestId("edit-header-x-user-id"))
    await user.clear(screen.getByTestId("header-key-input"))
    await user.type(screen.getByTestId("header-key-input"), "current_user_id")
    await user.click(screen.getByTestId("save-header"))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost" },
      auth: { mode: "header", source: "localStorage", key: "token", authType: "bearer" },
      sendCookiesWithRequests: true,
      headers: {
        "x-user-id": { source: "cookies", key: "current_user_id" }
      }
    })

    await user.click(screen.getByTestId("delete-header-x-user-id"))
    await user.click(await screen.findByRole("button", { name: "Delete" }))

    expect(mutateAsync).toHaveBeenLastCalledWith({
      baseUrl: { local: "http://localhost" },
      auth: { mode: "header", source: "localStorage", key: "token", authType: "bearer" },
      sendCookiesWithRequests: true,
      headers: {}
    })
  })

  it("blocks Authorization from being added as a custom header", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: {},
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: {}
      },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await user.click(screen.getByTestId("open-header-dialog"))
    await user.type(screen.getByTestId("header-name-input"), "Authorization")

    expect(screen.getByText("Configure Authorization in the authentication section above.")).not.toBeNull()
    expect(screen.getByTestId("save-header").getAttribute("disabled")).not.toBeNull()
  })

  it("surfaces save and delete failures", async () => {
    const mutateAsync = jest.fn(async () => {
      throw new Error("boom")
    }) as jest.Mock
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: {},
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: { "x-user-id": { source: "cookies", key: "user_id" } }
      },
      isPending: false
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    renderPanel()

    await user.click(screen.getByTestId("send-cookies-switch"))
    await user.click(screen.getByTestId("save-auth-settings"))
    expect(addToastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }))

    await user.click(screen.getByTestId("delete-header-x-user-id"))
    await user.click(await screen.findByRole("button", { name: "Delete" }))
    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }))
    })
  })

  it("respects the submitting guard", async () => {
    const mutateAsync = jest.fn(async (payload) => payload)
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: {},
        auth: { mode: "none" },
        sendCookiesWithRequests: false,
        headers: {}
      },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await user.click(screen.getByTestId("open-header-dialog"))
    await user.type(screen.getByTestId("header-name-input"), "x-user")
    await user.type(screen.getByTestId("header-key-input"), "user_id")

    await act(async () => {
      useConfigUiStore.getState().setHeaderSubmitting(true)
    })

    await user.click(screen.getByTestId("save-header"))
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
