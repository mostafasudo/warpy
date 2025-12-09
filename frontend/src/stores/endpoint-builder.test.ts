import { act } from "@testing-library/react"

import { useEndpointBuilderStore } from "./endpoint-builder"

describe("endpoint builder path params", () => {
  beforeEach(() => {
    useEndpointBuilderStore.getState().reset()
  })

  it("coerces and deduplicates path param enum values and clears fixed", () => {
    act(() => {
      const store = useEndpointBuilderStore.getState()
      store.setPath("/orders/:status")
      store.setPathParamFixed("status", "pending")
      store.setPathParamEnumValues("status", [" open ", "open", "closed", ""] as string[])
    })

    const param = useEndpointBuilderStore.getState().pathParams[0]
    expect(param.enumValues).toEqual(["open", "closed"])
    expect(param.fixed).toBeUndefined()
  })

  it("keeps fixed when enum values cleared", () => {
    act(() => {
      const store = useEndpointBuilderStore.getState()
      store.setPath("/orders/:status")
      store.setPathParamFixed("status", "pending")
      store.setPathParamEnumValues("status", undefined)
    })

    const param = useEndpointBuilderStore.getState().pathParams[0]
    expect(param.fixed).toBe("pending")
    expect(param.enumValues).toBeUndefined()
  })
})
