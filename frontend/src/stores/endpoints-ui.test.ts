import { describe, expect, it } from "@jest/globals"

import { endpointsUiSelectors, useEndpointsUiStore } from "./endpoints-ui"

describe("endpoints-ui store", () => {
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
    endpointsUiSelectors.openEdit(useEndpointsUiStore.getState())("id-1")
    expect(endpointsUiSelectors.editingId(useEndpointsUiStore.getState())).toBe("id-1")
    endpointsUiSelectors.closeEditor(useEndpointsUiStore.getState())()
    expect(endpointsUiSelectors.editorOpen(useEndpointsUiStore.getState())).toBe(false)
  })
})
