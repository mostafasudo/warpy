import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TooltipProvider } from "@/components/ui/tooltip"
import { useEndpointBuilderStore } from "@/stores/endpoint-builder"
import { EndpointEditor } from "./EndpointEditor"

const renderEditor = (onSave: () => void) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <TooltipProvider>
      <EndpointEditor editing={false} isSaving={false} onSave={onSave} onClose={() => {}} />
    </TooltipProvider>
  )
  return { user }
}

describe("EndpointEditor validation UI", () => {
  beforeEach(() => {
    useEndpointBuilderStore.getState().reset()
  })

  it("shows errors and highlights top-level fields when empty", async () => {
    const onSave = jest.fn()
    const { user } = renderEditor(onSave)

    expect(screen.getByTestId("save-endpoint").getAttribute("disabled")).toBeNull()
    await user.click(screen.getByTestId("save-endpoint"))

    const banner = await screen.findByTestId("endpoint-validation-banner")
    expect(banner.textContent ?? "").toContain("Path cannot be empty")
    expect(screen.getByTestId("endpoint-path").className).toContain("border-destructive")
    expect(screen.getByTestId("endpoint-name").className).toContain("border-destructive")
    expect(screen.getByTestId("endpoint-description").className).toContain("border-destructive")
    expect(onSave).not.toHaveBeenCalled()
  })

  it("highlights missing parameter details", async () => {
    const onSave = jest.fn()
    let headerId = ""
    let queryId = ""
    let bodyId = ""

    act(() => {
      const store = useEndpointBuilderStore.getState()
      store.reset()
      store.setPath("/users/:id")
      store.setName("get_user")
      store.setDescription("Fetch user")
      store.addFlatField("headers")
      headerId = useEndpointBuilderStore.getState().headers[0].id
      useEndpointBuilderStore.getState().updateFlatField("headers", headerId, { name: "auth", fixed: "" })
      store.addFlatField("queryParams")
      queryId = useEndpointBuilderStore.getState().queryParams[0].id
      useEndpointBuilderStore.getState().updateFlatField("queryParams", queryId, { name: "include", description: "" })
      store.addBodyField(null, "object")
      bodyId = useEndpointBuilderStore.getState().bodyFields[0].id
      useEndpointBuilderStore.getState().updateBodyField(bodyId, { name: "payload", description: "" })
    })

    const { user } = renderEditor(onSave)
    await user.click(screen.getByTestId("save-endpoint"))

    const banner = await screen.findByTestId("endpoint-validation-banner")
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
})
