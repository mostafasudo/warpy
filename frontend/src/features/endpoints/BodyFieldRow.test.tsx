/// <reference types="@testing-library/jest-dom" />
import { useState } from "react"
import { describe, expect, it, beforeAll } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { BodyFieldRow } from "./BodyFieldRow"
import { type BodyField } from "@/stores/endpoint-builder"

beforeAll(() => {
  ;(HTMLElement.prototype as any).hasPointerCapture = () => false
  ;(HTMLElement.prototype as any).releasePointerCapture = () => {}
  ;(Element.prototype as any).scrollIntoView = () => {}
})

const renderField = (field: BodyField, handlers: any = {}) => {
  const onUpdate = handlers.onUpdate ?? jest.fn()
  const onAdd = handlers.onAdd ?? jest.fn()
  const onRemove = handlers.onRemove ?? jest.fn()
  const Wrapper = () => {
    const [current, setCurrent] = useState(field)
    return (
      <TooltipProvider>
        <BodyFieldRow
          field={current}
          depth={0}
          invalid={{}}
          onUpdate={(id, patch) => {
            if (id === current.id) {
              setCurrent((prev) => ({ ...prev, ...patch }))
            }
            onUpdate(id, patch)
          }}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      </TooltipProvider>
    )
  }

  return render(<Wrapper />)
}

describe("BodyFieldRow", () => {
  it("handles primitive interactions and removal", async () => {
    const onUpdate = jest.fn()
    const onRemove = jest.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderField(
      { id: "f1", name: "status", type: "string", required: false, description: "desc" },
      { onUpdate, onRemove }
    )

    const nameInput = screen.getByDisplayValue("status")
    await user.clear(nameInput)
    await user.type(nameInput, "state")
    expect(onUpdate).toHaveBeenCalled()

    await user.click(screen.getByLabelText("Enum values"))
    await user.type(screen.getByTestId("body-field-f1-enum"), "open")
    await user.click(screen.getByTestId("body-field-f1-enum-add"))
    expect(onUpdate).toHaveBeenCalledWith("f1", expect.objectContaining({ enumValues: ["open"] }))

    await user.click(screen.getByLabelText("Fixed value"))
    expect(onUpdate).toHaveBeenCalledWith("f1", expect.objectContaining({ fixed: "" }))

    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByText("boolean"))
    expect(onUpdate).toHaveBeenCalledWith("f1", expect.objectContaining({ type: "boolean" }))

    await user.click(screen.getByTestId("remove-body-field-f1"))
    await user.click(await screen.findByRole("button", { name: "Remove" }))
    expect(onRemove).toHaveBeenCalledWith("f1")
  })

  it("supports fixed boolean values and nested add", async () => {
    const onUpdate = jest.fn()
    const onAdd = jest.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderField(
      { id: "bool", name: "flag", type: "boolean", required: false, description: "", fixed: false },
      { onUpdate, onAdd }
    )

    await user.click(screen.getByTestId("body-field-bool-fixed"))
    await user.click(await screen.findByText("true"))
    expect(onUpdate).toHaveBeenCalledWith("bool", expect.objectContaining({ fixed: true }))

    renderField(
      {
        id: "obj",
        name: "payload",
        type: "object",
        required: false,
        description: "",
        children: []
      },
      { onUpdate: jest.fn(), onAdd }
    )

    await user.click(screen.getByRole("button", { name: /Add child/i }))
    expect(onAdd).toHaveBeenCalledWith("obj", "string")
  })

  it("switches to array type and item type", async () => {
    const onUpdate = jest.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderField(
      { id: "arr", name: "tags", type: "string", required: false, description: "" },
      { onUpdate }
    )

    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByText("array"))
    expect(onUpdate).toHaveBeenCalledWith("arr", expect.objectContaining({ type: "array:string" }))

    const [, itemSelect] = await screen.findAllByRole("combobox")
    await user.click(itemSelect)
    await user.click(await screen.findByText("number"))
    expect(onUpdate).toHaveBeenCalledWith("arr", expect.objectContaining({ type: "array:number" }))
  })

  it("renders nested children for object fields", () => {
    renderField({
      id: "parent",
      name: "payload",
      type: "object",
      required: true,
      description: "body",
      children: [
        { id: "child-1", name: "id", type: "number", required: true, description: "id" }
      ]
    })

    expect(screen.getByDisplayValue("payload")).not.toBeNull()
    expect(screen.getAllByDisplayValue("id").length).toBeGreaterThan(0)
  })

  it("updates number fixed values and toggles required", async () => {
    const onUpdate = jest.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderField(
      { id: "num", name: "count", type: "number", required: true, description: "qty", fixed: 1 },
      { onUpdate }
    )

    await user.clear(screen.getByTestId("body-field-num-fixed"))
    await user.type(screen.getByTestId("body-field-num-fixed"), "9")
    expect(onUpdate.mock.calls.some(([_, patch]) => "fixed" in patch)).toBe(true)

    await user.click(screen.getByLabelText("Required"))
    await user.click(screen.getByLabelText("Fixed value"))
    expect(onUpdate).toHaveBeenCalledWith("num", expect.objectContaining({ required: false }))
    expect(onUpdate).toHaveBeenCalledWith("num", expect.objectContaining({ fixed: undefined }))
  })
})
