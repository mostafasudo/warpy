import { beforeEach, describe, expect, it, jest } from "@jest/globals"

const resetNavigationState = () => {
  document.cookie = "sidebar_collapsed=; Max-Age=0; path=/"
}

const originalDocument = document

const loadNavigationStore = async () => await import("./navigation")

describe("navigation store", () => {
  beforeEach(() => {
    jest.resetModules()
    resetNavigationState()
    global.document = originalDocument
  })

  afterEach(() => {
    global.document = originalDocument
    jest.restoreAllMocks()
  })

  it("defaults to expanded sidebar", async () => {
    const { navigationSelectors, useNavigationStore } = await loadNavigationStore()
    expect(navigationSelectors.section(useNavigationStore.getState())).toBe("dashboard")
    expect(navigationSelectors.sidebarCollapsed(useNavigationStore.getState())).toBe(false)
    expect(document.cookie).toContain("sidebar_collapsed=0")
  })

  it("uses persisted collapse state", async () => {
    document.cookie = "sidebar_collapsed=1"
    const { navigationSelectors, useNavigationStore } = await loadNavigationStore()
    expect(navigationSelectors.sidebarCollapsed(useNavigationStore.getState())).toBe(true)
  })

  it("updates section selection", async () => {
    const { navigationSelectors, useNavigationStore } = await loadNavigationStore()
    navigationSelectors.setSection(useNavigationStore.getState())("headers")
    expect(navigationSelectors.section(useNavigationStore.getState())).toBe("headers")
  })

  it("toggles and persists sidebar collapse state", async () => {
    const { navigationSelectors, useNavigationStore } = await loadNavigationStore()
    navigationSelectors.toggleSidebarCollapsed(useNavigationStore.getState())()
    expect(useNavigationStore.getState().sidebarCollapsed).toBe(true)
    expect(document.cookie).toContain("sidebar_collapsed=1")
    navigationSelectors.setSidebarCollapsed(useNavigationStore.getState())(false)
    expect(useNavigationStore.getState().sidebarCollapsed).toBe(false)
    expect(document.cookie).toContain("sidebar_collapsed=0")
    navigationSelectors.setSidebarCollapsed(useNavigationStore.getState())(false)
    expect(useNavigationStore.getState().sidebarCollapsed).toBe(false)
  })

  it("initializes when document is unavailable", async () => {
    ;(global as any).document = undefined
    const { navigationSelectors, useNavigationStore } = await loadNavigationStore()
    expect(navigationSelectors.sidebarCollapsed(useNavigationStore.getState())).toBe(false)
    ;(global as any).document = originalDocument
  })
})
