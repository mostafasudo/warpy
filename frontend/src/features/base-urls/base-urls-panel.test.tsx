/// <reference types="@testing-library/jest-dom" />
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { BaseUrlsPanel } from "./base-urls-panel"
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
      <BaseUrlsPanel />
    </TooltipProvider>
  )

describe("BaseUrlsPanel", () => {
  beforeEach(() => {
    useConfigUiStore.getState().resetBaseForm()
    useConfigUiStore.getState().resetHeaderForm()
    useConfigUiStore.getState().setBaseDialogOpen(false)
    useConfigUiStore.getState().setBaseSubmitting(false)
    mockedUseSaveConfig.mockReturnValue({
      mutateAsync: jest.fn(async (payload) => payload),
      isPending: false
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it("shows skeletons when pending", () => {
    mockedUseConfigQuery.mockReturnValue({ data: null, isPending: true })

    renderPanel()

    expect(screen.getAllByRole("row")).toHaveLength(4)
  })

  it("adds, edits, and deletes environments", async () => {
    const mutateAsync = jest.fn(async (payload) => payload)
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost", staging: "https://staging" }, headers: {} },
      isPending: false
    })

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPanel()

    await screen.findByText("staging")

    await user.click(screen.getByTestId("open-base-dialog"))
    await user.clear(screen.getByTestId("base-env-input"))
    await user.type(screen.getByTestId("base-env-input"), "dev")
    await user.clear(screen.getByTestId("base-url-input"))
    await user.type(screen.getByTestId("base-url-input"), "https://dev.example")
    await user.click(screen.getByTestId("save-base-env"))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost", staging: "https://staging", dev: "https://dev.example" },
      headers: {}
    })

    await user.click(screen.getByTestId("edit-env-staging"))
    await user.clear(screen.getByTestId("base-url-input"))
    await user.type(screen.getByTestId("base-url-input"), "https://new-staging")
    await user.click(screen.getByTestId("save-base-env"))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost", staging: "https://new-staging" },
      headers: {}
    })

    const deleteButton = screen.getByTestId("delete-env-staging")
    expect(deleteButton.className).toContain("hover:text-destructive")
    await user.click(deleteButton)
    await user.click(await screen.findByRole("button", { name: "Delete" }))

    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost" },
      headers: {}
    })
  })

  it("disables save on duplicate names", async () => {
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { production: "https://api" }, headers: {} },
      isPending: false
    })
    const mutateAsync = jest.fn(async (payload) => payload)
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    renderPanel()

    await user.click(screen.getByTestId("open-base-dialog"))
    await user.type(screen.getByTestId("base-env-input"), "production")
    await user.type(screen.getByTestId("base-url-input"), "https://dup")

    expect(screen.getByTestId("save-base-env").getAttribute("disabled")).not.toBeNull()
  })

  it("handles rename, submitting guard, and save failures", async () => {
    const mutateAsync = jest.fn(async () => {
      throw new Error("fail")
    }) as jest.Mock
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost", staging: "https://staging" }, headers: {} },
      isPending: false
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const addToast = useToastStore((state: any) => state.addToast)

    renderPanel()

    await user.click(screen.getByTestId("edit-env-staging"))
    await user.clear(screen.getByTestId("base-env-input"))
    await user.type(screen.getByTestId("base-env-input"), "qa")
    await user.click(screen.getByTestId("save-base-env"))
    expect(mutateAsync).toHaveBeenCalledWith({
      baseUrl: { local: "http://localhost", qa: "https://staging" },
      headers: {}
    })

    await user.click(screen.getByTestId("open-base-dialog"))
    await user.type(screen.getByTestId("base-env-input"), "dev")
    await user.type(screen.getByTestId("base-url-input"), "https://dev")
    await act(async () => {
      useConfigUiStore.getState().setBaseSubmitting(true)
    })
    await user.click(screen.getByTestId("save-base-env"))
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    await act(async () => {
      useConfigUiStore.getState().setBaseSubmitting(false)
    })
    await user.click(screen.getByTestId("save-base-env"))
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }))
  })

  it("guards required deletions and reports delete errors", async () => {
    const mutateAsync = jest.fn(async () => {
      throw new Error("delete error")
    }) as jest.Mock
    mockedUseSaveConfig.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseConfigQuery.mockReturnValue({
      data: { baseUrl: { local: "http://localhost", dev: "https://dev" }, headers: {} },
      isPending: false
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const addToast = useToastStore((state: any) => state.addToast)

    renderPanel()

    expect(screen.getByTestId("delete-env-local").className).toContain("hover:text-destructive")
    await user.click(screen.getByTestId("delete-env-local"))
    expect(mutateAsync).not.toHaveBeenCalled()

    expect(screen.getByTestId("delete-env-dev").className).toContain("hover:text-destructive")
    await user.click(screen.getByTestId("delete-env-dev"))
    await user.click(await screen.findByRole("button", { name: "Delete" }))
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }))
  })
})
