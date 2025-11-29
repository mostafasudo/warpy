/// <reference types="@testing-library/jest-dom" />
import { beforeAll, describe, expect, it, jest } from "@jest/globals"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { FlatFieldRow } from "./FlatFieldRow"
import { type FlatField } from "@/stores/endpoint-builder"

beforeAll(() => {
  ;(HTMLElement.prototype as any).hasPointerCapture = () => false
  ;(HTMLElement.prototype as any).releasePointerCapture = () => {}
})

const renderRow = (field: FlatField, handlers: any = {}) =>
  render(
    <TooltipProvider>
      <FlatFieldRow
        field={field}
        onChange={handlers.onChange ?? jest.fn()}
        onRemove={handlers.onRemove ?? jest.fn()}
        focusRef={handlers.focusRef}
      />
    </TooltipProvider>
  )

describe("FlatFieldRow", () => {
  it("edits descriptions, toggles switches, and removes fields", async () => {
    const onChange = jest.fn() as jest.Mock
    const onRemove = jest.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderRow({ id: "f1", name: "Auth", type: "string", required: false, description: "desc" }, { onChange, onRemove })

    await user.clear(screen.getByTestId("field-f1-name"))
    await user.type(screen.getByTestId("field-f1-name"), "Header")
    await user.type(screen.getByTestId("field-f1-description"), "x")
    const switches = screen.getAllByRole("switch")
    await user.click(switches[0])
    await user.click(switches[1])
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ required: true }))
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
