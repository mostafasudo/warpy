import { describe, expect, it, jest } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ReactElement } from "react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { type BodyField, type FlatField } from "@/stores/tool-builder"
import { BodyFieldRow } from "./BodyFieldRow"
import { FlatFieldRow } from "./FlatFieldRow"

const setup = (ui: ReactElement) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<TooltipProvider>{ui}</TooltipProvider>)
  return user
}

describe("FlatFieldRow remove dialog", () => {
  it("removes with enter", async () => {
    const onRemove = jest.fn()
    const field: FlatField = {
      id: "field-1",
      name: "auth",
      type: "string",
      required: false,
      description: ""
    }

    const user = setup(<FlatFieldRow field={field} onChange={jest.fn()} onRemove={onRemove} />)

    await user.click(screen.getByTestId("remove-flat-field-field-1"))
    await screen.findByText("Remove field?")
    await user.keyboard("{Enter}")

    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})

describe("BodyFieldRow remove dialog", () => {
  it("removes with enter", async () => {
    const onRemove = jest.fn()
    const field: BodyField = {
      id: "body-1",
      name: "payload",
      type: "string",
      required: false,
      description: ""
    }

    const user = setup(
      <BodyFieldRow
        field={field}
        depth={0}
        onUpdate={jest.fn()}
        onAdd={jest.fn()}
        onRemove={onRemove}
      />
    )

    await user.click(screen.getByTestId("remove-body-field-body-1"))
    await screen.findByText("Remove field?")
    await user.keyboard("{Enter}")

    expect(onRemove).toHaveBeenCalledWith("body-1")
  })
})
