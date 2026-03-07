/// <reference types="@testing-library/jest-dom" />
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { SessionHeadersPanel } from "./session-headers-panel"
import { useConfigUiStore } from "@/stores/config-ui"
import { useToastStore } from "@/stores/toast"

jest.mock("@/queries/use-config", () => ({
  useConfigQuery: jest.fn()
}))

jest.mock("@/queries/use-save-config", () => ({
  useSaveConfig: jest.fn()
}))

jest.mock("@/stores/toast", () => {
  const addToast = jest.fn()
  return {
    useToastStore: (selector: any) => selector({ addToast, toasts: [], removeToast: jest.fn() }),
    toastSelectors: {
      addToast: (state: any) => state.addToast
    }
  }
})

const mockedUseConfigQuery = require("@/queries/use-config").useConfigQuery as jest.Mock
const mockedUseSaveConfig = require("@/queries/use-save-config").useSaveConfig as jest.Mock

const renderPanel = () =>
  render(
    <TooltipProvider>
      <SessionHeadersPanel />
    </TooltipProvider>
  )

describe("SessionHeadersPanel", () => {
  beforeAll(() => {
    ;(HTMLElement.prototype as any).hasPointerCapture = () => false
    ;(HTMLElement.prototype as any).releasePointerCapture = () => {}
    ;(HTMLElement.prototype as any).scrollIntoView = () => {}
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

  it("adds, edits, and deletes headers", async () => {
    const mutateAsync = jest.fn(async (payload) => payload)
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: { local: "http://localhost" },
        headers: { auth: { source: "cookies", key: "authorization" } }
      },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await screen.findByText("auth")

    await user.click(screen.getByTestId("open-header-dialog"))
    await user.clear(screen.getByTestId("header-name-input"))
    await user.type(screen.getByTestId("header-name-input"), "x-user")
    await user.clear(screen.getByTestId("header-key-input"))
    await user.type(screen.getByTestId("header-key-input"), "x-user-id")
    await user.click(screen.getByTestId("save-header"))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost" },
      headers: {
        auth: { source: "cookies", key: "authorization" },
        "x-user": { source: "localStorage", key: "x-user-id" }
      }
    })

    await user.click(screen.getByTestId("edit-header-auth"))
    await user.clear(screen.getByTestId("header-key-input"))
    await user.type(screen.getByTestId("header-key-input"), "auth-cookie")
    await user.click(screen.getByTestId("save-header"))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost" },
      headers: { auth: { source: "cookies", key: "auth-cookie" } }
    })

    const deleteButton = screen.getByTestId("delete-header-auth")
    expect(deleteButton.className).toContain("hover:text-destructive")
    await user.click(deleteButton)
    await user.click(await screen.findByRole("button", { name: "Delete" }))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost" },
      headers: {}
    })
  })

  it("shows auth type selector for authorization headers", async () => {
    const mutateAsync = jest.fn(async (payload) => payload)
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: {
        baseUrl: {},
        headers: { Authorization: { source: "cookies", key: "auth", authType: "basic" } }
      },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await screen.findByText("Authorization")

    await user.click(screen.getByTestId("edit-header-Authorization"))
    await user.click(screen.getByTestId("auth-type-trigger"))
    await user.click(await screen.findByRole("option", { name: "Bearer" }))
    await user.click(screen.getByTestId("save-header"))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: {},
      headers: { Authorization: { source: "cookies", key: "auth", authType: "bearer" } }
    })
  })

  it("prevents duplicate header names", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: {}, headers: { auth: { source: "cookies", key: "token" } } },
      isPending: false
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    renderPanel()

    await user.click(screen.getByTestId("open-header-dialog"))
    await user.type(screen.getByTestId("header-name-input"), "auth-new")

    expect(screen.getByTestId("save-header").getAttribute("disabled")).not.toBeNull()
  })

  it("handles rename and submit failures", async () => {
    const mutateAsync = jest.fn(async () => {
      throw new Error("boom")
    }) as jest.Mock
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: {}, headers: { auth: { source: "cookies", key: "token" } } },
      isPending: false
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const addToast = useToastStore((state: any) => state.addToast)

    renderPanel()

    await user.click(screen.getByTestId("edit-header-auth"))
    await user.clear(screen.getByTestId("header-name-input"))
    await user.type(screen.getByTestId("header-name-input"), "auth-2")
    await user.click(screen.getByTestId("save-header"))
    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: {},
      headers: { "auth-2": { source: "cookies", key: "token" } }
    })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }))
  })

  it("respects submitting guard and surfaces delete errors", async () => {
    const mutateAsync = jest.fn(async () => {
      throw new Error("delete")
    }) as jest.Mock
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: {}, headers: { auth: { source: "cookies", key: "token" } } },
      isPending: false
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const addToast = useToastStore((state: any) => state.addToast)

    renderPanel()

    await user.click(screen.getByTestId("open-header-dialog"))
    await user.type(screen.getByTestId("header-name-input"), "auth-new")
    await user.type(screen.getByTestId("header-key-input"), "token")
    await act(async () => {
      useConfigUiStore.getState().setHeaderSubmitting(true)
    })
    await user.click(screen.getByTestId("save-header"))
    expect(mutateAsync).not.toHaveBeenCalled()
    await act(async () => {
      useConfigUiStore.getState().setHeaderSubmitting(false)
    })
    await user.click(screen.getByTestId("save-header"))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())

    expect(screen.getByTestId("delete-header-auth").className).toContain("hover:text-destructive")
    await user.click(screen.getByTestId("delete-header-auth"))
    await user.click(await screen.findByRole("button", { name: "Delete" }))
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }))
  })
})
