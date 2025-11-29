import { describe, expect, it, jest } from "@jest/globals"

import { toastSelectors, useToastStore } from "./toast"

jest.useFakeTimers()

describe("toast store", () => {
  it("adds and auto-removes toasts", () => {
    const addToast = toastSelectors.addToast(useToastStore.getState())
    const removeToast = toastSelectors.removeToast(useToastStore.getState())

    addToast({ title: "Saved", description: "done", variant: "success" })
    expect(toastSelectors.toasts(useToastStore.getState())).toHaveLength(1)

    const id = toastSelectors.toasts(useToastStore.getState())[0].id
    removeToast(id)
    expect(toastSelectors.toasts(useToastStore.getState())).toHaveLength(0)

    addToast({ title: "Temp", variant: "error" })
    jest.advanceTimersByTime(3600)
    expect(toastSelectors.toasts(useToastStore.getState())).toHaveLength(0)
  })
})
