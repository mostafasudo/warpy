/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ToastContainer } from "./toast-container"
import { useToastStore } from "@/stores/toast"

describe("ToastContainer", () => {
  it("renders toasts and dismisses them", async () => {
    useToastStore.setState({
      toasts: [
        { id: "1", title: "Saved", description: "ok", variant: "success" },
        { id: "2", title: "Failed", description: "bad", variant: "error" }
      ],
      addToast: useToastStore.getState().addToast,
      removeToast: useToastStore.getState().removeToast
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ToastContainer />)

    expect(screen.getByText("Saved")).not.toBeNull()
    expect(screen.getByText("Failed")).not.toBeNull()

    await user.click(screen.getAllByRole("button", { name: "" })[0])
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it("omits description when not provided", () => {
    useToastStore.setState({
      toasts: [{ id: "3", title: "Notice", variant: "success" }],
      addToast: useToastStore.getState().addToast,
      removeToast: useToastStore.getState().removeToast
    })

    render(<ToastContainer />)

    expect(screen.queryByText("Notice")).not.toBeNull()
    expect(screen.queryByText((content, element) => element?.tagName === "P" && content === "")).toBeNull()
  })
})
