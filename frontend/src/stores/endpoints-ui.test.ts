import { describe, expect, it, beforeEach } from "@jest/globals"

import { endpointsUiSelectors, useEndpointsUiStore } from "./endpoints-ui"
import type { EndpointResponse } from "@/types"

describe("endpoints-ui store", () => {
  beforeEach(() => {
    useEndpointsUiStore.setState({
      page: 1,
      pageSize: 5,
      editorOpen: false,
      editingId: null,
      editingEndpoint: null,
      search: "",
      searchDraft: ""
    })
  })

  it("updates pagination and search state", () => {
    endpointsUiSelectors.setPage(useEndpointsUiStore.getState())(2)
    endpointsUiSelectors.setPageSize(useEndpointsUiStore.getState())(20)
    endpointsUiSelectors.setSearchDraft(useEndpointsUiStore.getState())("user")
    endpointsUiSelectors.setSearch(useEndpointsUiStore.getState())("users")
    expect(endpointsUiSelectors.page(useEndpointsUiStore.getState())).toBe(1)
    expect(endpointsUiSelectors.pageSize(useEndpointsUiStore.getState())).toBe(20)
    expect(endpointsUiSelectors.searchDraft(useEndpointsUiStore.getState())).toBe("user")
    expect(endpointsUiSelectors.search(useEndpointsUiStore.getState())).toBe("users")
  })

  it("opens editors for create and edit", () => {
    endpointsUiSelectors.openCreate(useEndpointsUiStore.getState())()
    expect(endpointsUiSelectors.editorOpen(useEndpointsUiStore.getState())).toBe(true)
    expect(endpointsUiSelectors.editingId(useEndpointsUiStore.getState())).toBeNull()
    const endpoint: EndpointResponse = {
      id: "id-1",
      path: "/path",
      method: "GET",
      tool: {
        type: "function",
        function: { name: "test", description: "desc", parameters: { type: "object", properties: {} } }
      },
      agentEnabled: true,
      feature: { id: "feature-1", name: "Feature", enabledState: "enabled", endpointCount: 1 }
    }
    endpointsUiSelectors.openEdit(useEndpointsUiStore.getState())(endpoint)
    expect(endpointsUiSelectors.editingId(useEndpointsUiStore.getState())).toBe("id-1")
    expect(endpointsUiSelectors.editingEndpoint(useEndpointsUiStore.getState())).toEqual(endpoint)
    endpointsUiSelectors.closeEditor(useEndpointsUiStore.getState())()
    expect(endpointsUiSelectors.editorOpen(useEndpointsUiStore.getState())).toBe(false)
  })
})
