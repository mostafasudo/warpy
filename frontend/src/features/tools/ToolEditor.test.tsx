import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { useToolBuilderStore } from "@/stores/tool-builder"
import { ToolEditor } from "./ToolEditor"

const renderEditor = (onSave: () => void) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <TooltipProvider>
      <ToolEditor editing={false} isSaving={false} onSave={onSave} onClose={() => {}} features={[]} />
    </TooltipProvider>
  )
  return { user }
}

describe("ToolEditor validation UI", () => {
  beforeEach(() => {
    useToolBuilderStore.getState().reset()
  })

  it("shows errors and highlights top-level fields when empty", async () => {
    const onSave = jest.fn()
    const { user } = renderEditor(onSave)

    expect(screen.getByTestId("save-tool").getAttribute("disabled")).toBeNull()
    await user.click(screen.getByTestId("save-tool"))

    const banner = await screen.findByTestId("tool-validation-banner")
    expect(banner.textContent ?? "").toContain("Path cannot be empty")
    expect(screen.getByTestId("tool-path").className).toContain("border-destructive")
    expect(screen.getByTestId("tool-name").className).toContain("border-destructive")
    expect(screen.getByTestId("tool-description").className).toContain("border-destructive")
    expect(onSave).not.toHaveBeenCalled()
  })

  it("highlights missing parameter details", async () => {
    const onSave = jest.fn()
    let headerId = ""
    let queryId = ""
    let bodyId = ""

    act(() => {
      const store = useToolBuilderStore.getState()
      store.reset()
      store.setPath("/users/:id")
      store.setMethod("POST")
      store.setName("get_user")
      store.setDescription("Fetch user")
      store.addFlatField("headers")
      headerId = useToolBuilderStore.getState().headers[0].id
      useToolBuilderStore.getState().updateFlatField("headers", headerId, { name: "auth", fixed: "" })
      store.addFlatField("queryParams")
      queryId = useToolBuilderStore.getState().queryParams[0].id
      useToolBuilderStore.getState().updateFlatField("queryParams", queryId, { name: "include", description: "" })
      store.addBodyField(null, "object")
      bodyId = useToolBuilderStore.getState().bodyFields[0].id
      useToolBuilderStore.getState().updateBodyField(bodyId, { name: "payload", description: "" })
    })

    const { user } = renderEditor(onSave)
    await user.click(screen.getByTestId("save-tool"))

    const banner = await screen.findByTestId("tool-validation-banner")
    const bannerText = banner.textContent ?? ""
    expect(bannerText).toContain("id description cannot be empty")
    expect(bannerText).toContain("auth fixed value cannot be empty")
    expect(bannerText).toContain("include description cannot be empty")
    expect(bannerText).toContain("payload description cannot be empty")
    expect(screen.getByTestId("path-param-id-description").className).toContain("border-destructive")
    expect(screen.getByTestId(`field-${headerId}-fixed`).className).toContain("border-destructive")
    expect(screen.getByTestId(`field-${queryId}-description`).className).toContain("border-destructive")
    expect(screen.getByTestId(`body-field-${bodyId}-description`).className).toContain("border-destructive")
    expect(onSave).not.toHaveBeenCalled()
  })

  it("returns focus to add headers after confirming removal with enter", async () => {
    const { user } = renderEditor(jest.fn())

    await user.click(screen.getByTestId("add-headers"))
    const headerId = useToolBuilderStore.getState().headers[0].id

    await user.click(screen.getByTestId(`remove-flat-field-${headerId}`))
    const confirmButton = await screen.findByRole("button", { name: "Remove" })
    confirmButton.focus()
    await user.keyboard("{Enter}")

    await waitFor(() => expect(screen.queryByTestId(`remove-flat-field-${headerId}`)).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("add-headers")))
  })

  it("clears path param enum values when enabling fixed", async () => {
    act(() => {
      const store = useToolBuilderStore.getState()
      store.reset()
      store.setPath("/items/:id")
      store.setName("get_item")
      store.setDescription("desc")
      store.setPathParamEnumValues("id", ["open", "open", "closed"])
    })

    const { user } = renderEditor(jest.fn())

    await user.click(screen.getByTestId("path-param-id-fixed-toggle"))

    const param = useToolBuilderStore.getState().pathParams[0]
    expect(param.fixed).toBe("")
    expect(param.enumValues).toBeUndefined()
  })

  it("clears path param fixed value when enabling enum", async () => {
    act(() => {
      const store = useToolBuilderStore.getState()
      store.reset()
      store.setPath("/items/:id")
      store.setName("get_item")
      store.setDescription("desc")
      store.setPathParamFixed("id", "123")
    })

    const { user } = renderEditor(jest.fn())

    await user.click(screen.getByTestId("path-param-id-fixed-toggle"))
    const enumToggle = await screen.findByLabelText("Enum values")
    await user.click(enumToggle)

    const param = useToolBuilderStore.getState().pathParams[0]
    expect(param.enumValues).toEqual([])
    expect(param.fixed).toBeUndefined()
  })

  it("shows frontend parameter validation errors", async () => {
    const onSave = jest.fn()
    act(() => {
      const store = useToolBuilderStore.getState()
      store.reset()
      store.setToolType("frontend")
      store.setName("open_drawer")
      store.setDescription("Open drawer")
      store.addBodyField(null, "string")
    })

    const { user } = renderEditor(onSave)
    await user.click(screen.getByTestId("save-tool"))

    const banner = await screen.findByTestId("tool-validation-banner")
    expect(banner.textContent ?? "").toContain("field 1 name cannot be empty")
    expect(onSave).not.toHaveBeenCalled()
  })

  it("replaces spaces with underscores in variable and path param names while typing", async () => {
    act(() => {
      const store = useToolBuilderStore.getState()
      store.reset()
      store.setPath("/users/:user id")
      store.setMethod("POST")
      store.setName("update_user")
      store.setDescription("Update user")
    })

    const { user } = renderEditor(jest.fn())

    expect((screen.getByTestId("tool-path") as HTMLInputElement).value).toBe("/users/:user_id")
    expect(screen.getByTestId("path-param-user_id-description")).not.toBeNull()

    await user.click(screen.getByTestId("add-headers"))
    const headerId = useToolBuilderStore.getState().headers[0].id
    const headerNameInput = screen.getByTestId(`field-${headerId}-name`) as HTMLInputElement
    await user.type(headerNameInput, "x api key")
    expect(headerNameInput.value).toBe("x_api_key")

    await user.click(screen.getByRole("button", { name: "Add field" }))
    const bodyNameInput = screen.getByPlaceholderText("Field name") as HTMLInputElement
    await user.type(bodyNameInput, "line item")
    expect(bodyNameInput.value).toBe("line_item")
  })

  it("renders frontend handler snippet from tool fields", () => {
    act(() => {
      const store = useToolBuilderStore.getState()
      store.reset()
      store.setToolType("frontend")
      store.setName("open_drawer")
      store.setDescription("Open drawer")
      store.addBodyField(null, "string")
      const bodyFieldId = useToolBuilderStore.getState().bodyFields[0].id
      useToolBuilderStore.getState().updateBodyField(bodyFieldId, {
        name: "orderId",
        description: "Order id"
      })
    })

    renderEditor(jest.fn())

    const snippet = screen.getByTestId("frontend-handler-snippet").textContent ?? ""
    expect(snippet).toContain("if (toolName === \"open_drawer\")")
    expect(snippet).toContain("const orderId = vars[\"orderId\"]")
  })
})
