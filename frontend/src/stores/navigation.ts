import { create } from "zustand"

type Section = "base" | "headers" | "endpoints"

type NavigationState = {
  section: Section
  setSection: (section: Section) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  section: "base",
  setSection: (section) => set({ section })
}))

export const navigationSelectors = {
  section: (state: NavigationState) => state.section,
  setSection: (state: NavigationState) => state.setSection
}
