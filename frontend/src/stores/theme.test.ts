import { beforeEach, describe, expect, it, jest } from "@jest/globals"

const resetThemeState = () => {
  document.cookie = "theme=; Max-Age=0; path=/"
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.classList.remove("dark")
}

const mockMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn()
    })
  })
}

const loadThemeStore = async () => await import("./theme")

describe("theme store", () => {
  beforeEach(() => {
    jest.resetModules()
    resetThemeState()
    mockMatchMedia(false)
  })

  it("defaults to dark and applies attributes", async () => {
    const { themeSelectors, useThemeStore } = await loadThemeStore()
    expect(themeSelectors.theme(useThemeStore.getState())).toBe("dark")
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.cookie).toContain("theme=dark")
  })

  it("uses cookie preference", async () => {
    document.cookie = "theme=light"
    const { themeSelectors, useThemeStore } = await loadThemeStore()
    expect(themeSelectors.theme(useThemeStore.getState())).toBe("light")
    expect(document.documentElement.dataset.theme).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("uses system theme preference from cookie", async () => {
    mockMatchMedia(true)
    document.cookie = "theme=system"
    const { themeSelectors, useThemeStore } = await loadThemeStore()
    expect(themeSelectors.theme(useThemeStore.getState())).toBe("system")
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("updates theme and persists it", async () => {
    const { themeSelectors, useThemeStore } = await loadThemeStore()
    themeSelectors.setTheme(useThemeStore.getState())("light")
    expect(useThemeStore.getState().theme).toBe("light")
    expect(document.cookie).toContain("theme=light")
    expect(document.documentElement.dataset.theme).toBe("light")
    themeSelectors.setTheme(useThemeStore.getState())("system")
    expect(useThemeStore.getState().theme).toBe("system")
    expect(document.cookie).toContain("theme=system")
    expect(document.documentElement.dataset.theme).toBe("light")
    themeSelectors.setTheme(useThemeStore.getState())("dark")
    expect(useThemeStore.getState().theme).toBe("dark")
    expect(document.cookie).toContain("theme=dark")
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("falls back to dark when matchMedia is unavailable", async () => {
    const originalMatchMedia = window.matchMedia
    ;(window as any).matchMedia = undefined
    document.cookie = "theme=system"
    const { themeSelectors, useThemeStore } = await loadThemeStore()
    expect(themeSelectors.theme(useThemeStore.getState())).toBe("system")
    expect(document.documentElement.dataset.theme).toBe("dark")
    ;(window as any).matchMedia = originalMatchMedia
  })

  it("handles environments without document", async () => {
    const originalDocument = global.document
    ;(global as any).document = undefined
    const { themeSelectors, useThemeStore } = await loadThemeStore()
    expect(themeSelectors.theme(useThemeStore.getState())).toBe("dark")
    ;(global as any).document = originalDocument
  })
})
