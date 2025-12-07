import { create } from "zustand"

type Section = "dashboard" | "api" | "features" | "agent"

type NavigationState = {
  section: Section
  sidebarCollapsed: boolean
  setSection: (section: Section) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebarCollapsed: () => void
}

const sidebarCollapsedKey = "sidebar_collapsed"

const getSidebarCollapsedFromCookie = (): boolean | null => {
  if (typeof document === "undefined") {
    return null
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${sidebarCollapsedKey}=(0|1)`))
  if (!match) {
    return null
  }
  return match[1] === "1"
}

const persistSidebarCollapsed = (collapsed: boolean) => {
  if (typeof document === "undefined") {
    return
  }
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; secure" : ""
  document.cookie = `${sidebarCollapsedKey}=${collapsed ? "1" : "0"}; path=/; max-age=31536000; samesite=lax${secure}`
}

const initialSidebarCollapsed = getSidebarCollapsedFromCookie() ?? false
persistSidebarCollapsed(initialSidebarCollapsed)

export const useNavigationStore = create<NavigationState>((set) => ({
  section: "dashboard",
  sidebarCollapsed: initialSidebarCollapsed,
  setSection: (section) => set({ section }),
  setSidebarCollapsed: (collapsed) =>
    set((state) => {
      if (state.sidebarCollapsed === collapsed) {
        return state
      }
      persistSidebarCollapsed(collapsed)
      return { sidebarCollapsed: collapsed }
    }),
  toggleSidebarCollapsed: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed
      persistSidebarCollapsed(sidebarCollapsed)
      return { sidebarCollapsed }
    })
}))

export const navigationSelectors = {
  section: (state: NavigationState) => state.section,
  sidebarCollapsed: (state: NavigationState) => state.sidebarCollapsed,
  setSection: (state: NavigationState) => state.setSection,
  setSidebarCollapsed: (state: NavigationState) => state.setSidebarCollapsed,
  toggleSidebarCollapsed: (state: NavigationState) => state.toggleSidebarCollapsed
}
