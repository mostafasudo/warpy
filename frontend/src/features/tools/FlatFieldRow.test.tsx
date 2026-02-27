/// <reference types="@testing-library/jest-dom" />
import { useState } from "react"
import { beforeAll, describe, expect, it, jest } from "@jest/globals"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { FlatFieldRow } from "./FlatFieldRow"
import { type FlatField } from "@/stores/tool-builder"

beforeAll(() => {
  ;(HTMLElement.prototype as any).hasPointerCapture = () => false
  ;(HTMLElement.prototype as any).releasePointerCapture = () => {}
})

const renderRow = (field: FlatField, handlers: any = {}) => {
  const onChange = handlers.onChange ?? jest.fn()
  const onRemove = handlers.onRemove ?? jest.fn()
  const Wrapper = () => {
    const [current, setCurrent] = useState(field)
    return (
      <TooltipProvider>
        <FlatFieldRow
          field={current}
          onChange={(patch) => {
            setCurrent((prev) => ({ ...prev, ...patch }))
            onChange(patch)
          }}
          onRemove={onRemove}
          focusRef={handlers.focusRef}
        />
      </TooltipProvider>
    )
  }

  return render(<Wrapper />)
}

describe("FlatFieldRow", () => {
  it("edits descriptions, toggles switches, and removes fields", async () => {
    const onChange = jest.fn() as jest.Mock
    const onRemove = jest.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderRow({ id: "f1", name: "Auth", type: "string", required: false, description: "desc", enumValues: [] }, { onChange, onRemove })

    await user.clear(screen.getByTestId("field-f1-name"))
    await user.type(screen.getByTestId("field-f1-name"), "Header")
    await user.type(screen.getByTestId("field-f1-description"), "x")
    await user.click(screen.getByLabelText("Required"))
    await user.type(screen.getByTestId("field-f1-enum"), "open")
    await user.click(screen.getByTestId("field-f1-enum-add"))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ required: true }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enumValues: ["open"] }))
    await user.click(screen.getByRole("button", { name: "Remove open" }))
    await user.click(screen.getByLabelText("Fixed value"))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fixed: "" }))

    await user.click(screen.getByTestId("remove-flat-field-f1"))
    await user.click(await screen.findByRole("button", { name: "Remove" }))
    expect(onRemove).toHaveBeenCalled()
  })

  it("updates fixed values and focuses caller after remove", async () => {
    const onChange = jest.fn() as jest.Mock
    const onRemove = jest.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const focusButton = document.createElement("button")
    const focusSpy = jest.spyOn(focusButton, "focus")

    renderRow(
      { id: "f2", name: "Key", type: "string", required: true, description: "", fixed: "abc" },
      { onChange, onRemove, focusRef: { current: focusButton } }
    )

    await user.clear(screen.getByTestId("field-f2-fixed"))
    await user.type(screen.getByTestId("field-f2-fixed"), "xyz")
    expect((onChange as jest.Mock).mock.calls.some(([patch]: any[]) => "fixed" in (patch as any))).toBe(true)

    await user.click(screen.getByTestId("remove-flat-field-f2"))
    await user.click(await screen.findByRole("button", { name: "Remove" }))
    await act(async () => Promise.resolve())
    expect(onRemove).toHaveBeenCalled()
    expect(focusSpy).toHaveBeenCalled()
  })
})
