import { describe, expect, it, beforeEach } from "@jest/globals"

import { toolsUiSelectors, useToolsUiStore } from "./tools-ui"
import type { ToolResponse } from "@/types"

describe("tools-ui store", () => {
  beforeEach(() => {
    useToolsUiStore.setState({
      page: 1,
      pageSize: 5,
      editorOpen: false,
      editingId: null,
      editingTool: null,
      search: "",
      searchDraft: ""
    })
  })

  it("updates pagination and search state", () => {
    toolsUiSelectors.setSearchDraft(useToolsUiStore.getState())("user")
    toolsUiSelectors.setSearch(useToolsUiStore.getState())("users")
    toolsUiSelectors.setPageSize(useToolsUiStore.getState())(20)
    toolsUiSelectors.setPage(useToolsUiStore.getState())(2)
    expect(toolsUiSelectors.page(useToolsUiStore.getState())).toBe(2)
    expect(toolsUiSelectors.pageSize(useToolsUiStore.getState())).toBe(20)
    expect(toolsUiSelectors.searchDraft(useToolsUiStore.getState())).toBe("user")
    expect(toolsUiSelectors.search(useToolsUiStore.getState())).toBe("users")
  })

  it("opens editors for create and edit", () => {
    toolsUiSelectors.openCreate(useToolsUiStore.getState())()
    expect(toolsUiSelectors.editorOpen(useToolsUiStore.getState())).toBe(true)
    expect(toolsUiSelectors.editingId(useToolsUiStore.getState())).toBeNull()
    const tool: ToolResponse = {
      id: "id-1",
      path: "/path",
      method: "GET",
      tool: {
        type: "function",
        function: { name: "test", description: "desc", parameters: { type: "object", properties: {} } }
      },
      agentEnabled: true,
      feature: { id: "feature-1", name: "Feature", enabledState: "enabled", toolCount: 1 }
    }
    toolsUiSelectors.openEdit(useToolsUiStore.getState())(tool)
    expect(toolsUiSelectors.editingId(useToolsUiStore.getState())).toBe("id-1")
    expect(toolsUiSelectors.editingTool(useToolsUiStore.getState())).toEqual(tool)
    toolsUiSelectors.closeEditor(useToolsUiStore.getState())()
    expect(toolsUiSelectors.editorOpen(useToolsUiStore.getState())).toBe(false)
  })
})
