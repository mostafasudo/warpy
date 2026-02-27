import { act } from "@testing-library/react"

import { useToolBuilderStore } from "./tool-builder"

describe("tool builder path params", () => {
  beforeEach(() => {
    useToolBuilderStore.getState().reset()
  })

  it("coerces and deduplicates path param enum values and clears fixed", () => {
    act(() => {
      const store = useToolBuilderStore.getState()
      store.setPath("/orders/:status")
      store.setPathParamFixed("status", "pending")
      store.setPathParamEnumValues("status", [" open ", "open", "closed", ""] as string[])
    })

    const param = useToolBuilderStore.getState().pathParams[0]
    expect(param.enumValues).toEqual(["open", "closed"])
    expect(param.fixed).toBeUndefined()
  })

  it("keeps fixed when enum values cleared", () => {
    act(() => {
      const store = useToolBuilderStore.getState()
      store.setPath("/orders/:status")
      store.setPathParamFixed("status", "pending")
      store.setPathParamEnumValues("status", undefined)
    })

    const param = useToolBuilderStore.getState().pathParams[0]
    expect(param.fixed).toBe("pending")
    expect(param.enumValues).toBeUndefined()
  })

  it("replaces spaces in path param names with underscores", () => {
    act(() => {
      const store = useToolBuilderStore.getState()
      store.setPath("/orders/:order id/{customer name}")
    })

    const state = useToolBuilderStore.getState()
    expect(state.path).toBe("/orders/:order_id/:customer_name")
    expect(state.pathParams.map((item) => item.name)).toEqual(["order_id", "customer_name"])
  })

  it("replaces spaces in header and query param names with underscores", () => {
    let headerId = ""
    let queryId = ""
    act(() => {
      const store = useToolBuilderStore.getState()
      store.addFlatField("headers")
      store.addFlatField("queryParams")
      headerId = useToolBuilderStore.getState().headers[0].id
      queryId = useToolBuilderStore.getState().queryParams[0].id
      store.updateFlatField("headers", headerId, { name: "x api key" })
      store.updateFlatField("queryParams", queryId, { name: "page size" })
    })

    const state = useToolBuilderStore.getState()
    expect(state.headers[0].name).toBe("x_api_key")
    expect(state.queryParams[0].name).toBe("page_size")
  })

  it("replaces spaces in body field names with underscores", () => {
    let parentId = ""
    let childId = ""
    act(() => {
      const store = useToolBuilderStore.getState()
      store.addBodyField(null, "object")
      parentId = useToolBuilderStore.getState().bodyFields[0].id
      store.updateBodyField(parentId, { name: "line item" })
      store.addBodyField(parentId, "string")
      childId = useToolBuilderStore.getState().bodyFields[0].children?.[0].id ?? ""
      store.updateBodyField(childId, { name: "order note" })
    })

    const state = useToolBuilderStore.getState()
    expect(state.bodyFields[0].name).toBe("line_item")
    expect(state.bodyFields[0].children?.[0].name).toBe("order_note")
  })
})
