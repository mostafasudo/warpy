/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it, beforeAll, jest } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { FlatFieldList } from "./FlatFieldList"

beforeAll(() => {
  ;(HTMLElement.prototype as any).hasPointerCapture = () => false
  ;(HTMLElement.prototype as any).releasePointerCapture = () => {}
})

const renderList = (props: any) =>
  render(
    <TooltipProvider>
      <FlatFieldList {...props} />
    </TooltipProvider>
  )

describe("FlatFieldList", () => {
  it("shows empty state", () => {
    renderList({
      title: "Headers",
      fields: [],
      onAdd: jest.fn(),
      onChange: jest.fn(),
      onRemove: jest.fn()
    })

    expect(screen.getByText(/Add headers\./i)).not.toBeNull()
  })

  it("supports add, change, and remove", async () => {
    const onAdd = jest.fn()
    const onChange = jest.fn()
    const onRemove = jest.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    renderList({
      title: "Headers",
      fields: [{ id: "h1", name: "auth", type: "string", required: false, description: "" }],
      onAdd,
      onChange,
      onRemove
    })

    await user.click(screen.getByTestId("add-headers"))
    expect(onAdd).toHaveBeenCalled()

    await user.type(screen.getByTestId("field-h1-name"), "x")
    expect(onChange).toHaveBeenCalled()

    await user.click(screen.getByTestId("remove-flat-field-h1"))
    await user.click(await screen.findByRole("button", { name: "Remove" }))
    expect(onRemove).toHaveBeenCalledWith("h1")
  })
})
