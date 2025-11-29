import { describe, expect, it, beforeEach } from "@jest/globals"

import { useEndpointBuilderStore, endpointBuilderUtils } from "./endpoint-builder"

describe("endpoint-builder store", () => {
  beforeEach(() => {
    useEndpointBuilderStore.getState().reset()
  })

  it("normalizes paths and syncs params", () => {
    useEndpointBuilderStore.getState().setPath("users/{id}/orders/:orderId")
    const state = useEndpointBuilderStore.getState()
    expect(state.path).toBe("/users/:id/orders/:orderId")
    expect(state.pathParams.map((p) => p.name)).toEqual(["id", "orderId"])
  })

  it("updates flat fields and clears fixed on type change", () => {
    useEndpointBuilderStore.getState().addFlatField("headers")
    const header = useEndpointBuilderStore.getState().headers[0]
    useEndpointBuilderStore.getState().updateFlatField("headers", header.id, { fixed: "x" })
    useEndpointBuilderStore.getState().updateFlatField("headers", header.id, { type: "number" })
    const updated = useEndpointBuilderStore.getState().headers[0]
    expect(updated.type).toBe("number")
    expect(updated.fixed).toBeUndefined()
  })

  it("adds nested body fields and removes them", () => {
    useEndpointBuilderStore.getState().addBodyField(null, "object")
    const parent = useEndpointBuilderStore.getState().bodyFields[0]
    useEndpointBuilderStore.getState().addBodyField(parent.id, "string")
    expect(useEndpointBuilderStore.getState().bodyFields[0].children?.length).toBe(1)
    useEndpointBuilderStore.getState().removeBodyField(parent.id)
    expect(useEndpointBuilderStore.getState().bodyFields).toHaveLength(0)
  })

  it("hydrates and resets state", () => {
    const nextState = {
      path: "/orders/:id",
      method: "POST" as const,
      name: "create_order",
      description: "Create order",
      pathParams: [{ name: "id", description: "order id" }],
      headers: [],
      queryParams: [],
      bodyFields: []
    }
    useEndpointBuilderStore.getState().hydrate(nextState)
    expect(useEndpointBuilderStore.getState().name).toBe("create_order")
    useEndpointBuilderStore.getState().reset()
    expect(useEndpointBuilderStore.getState().name).toBe("")
  })

  it("normalizes path input utility", () => {
    expect(endpointBuilderUtils.normalizePathInput("users")).toBe("/users")
    expect(endpointBuilderUtils.normalizePathInput(" /orders ")).toBe("/orders")
  })

  it("falls back to random id without crypto", () => {
    const originalCrypto = (global as any).crypto
    ;(global as any).crypto = undefined
    useEndpointBuilderStore.getState().addFlatField("queryParams")
    expect(useEndpointBuilderStore.getState().queryParams[0].id).toBeDefined()
    ;(global as any).crypto = originalCrypto
  })

  it("resets children and fixed when type changes", () => {
    useEndpointBuilderStore.setState({
      ...useEndpointBuilderStore.getState(),
      bodyFields: [{ id: "body-1", name: "body", type: "boolean", required: false, description: "", fixed: true }]
    })

    useEndpointBuilderStore.getState().updateBodyField("body-1", { type: "object" })
    const updated = useEndpointBuilderStore.getState().bodyFields[0]
    expect(updated.children).toEqual([])
    expect(updated.fixed).toBeUndefined()
  })
})
