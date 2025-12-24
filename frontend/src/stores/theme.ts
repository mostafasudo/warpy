import { create } from "zustand"

type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const themeKey = "theme"

const getThemeFromCookie = (): Theme | null => {
  if (typeof document === "undefined") {
    return null
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${themeKey}=(light|dark|system)`))
  return (match?.[1] as Theme) ?? null
}

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark"
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

const resolveTheme = (theme: Theme): ResolvedTheme => (theme === "system" ? getSystemTheme() : theme)

const persistTheme = (theme: Theme) => {
  if (typeof document === "undefined") {
    return
  }
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; secure" : ""
  document.cookie = `${themeKey}=${theme}; path=/; max-age=31536000; samesite=lax${secure}`
}

const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") {
    return
  }
  const resolvedTheme = resolveTheme(theme)
  const root = document.documentElement
  root.dataset.theme = resolvedTheme
  root.classList.toggle("dark", resolvedTheme === "dark")
}

const initialTheme = typeof document !== "undefined" ? getThemeFromCookie() ?? "dark" : "dark"
if (typeof document !== "undefined") {
  applyTheme(initialTheme)
  persistTheme(initialTheme)
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  setTheme: (theme) =>
    set((state) => {
      if (state.theme === theme) {
        return state
      }
      applyTheme(theme)
      persistTheme(theme)
      return { theme }
    })
}))

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  const handleChange = () => {
    if (useThemeStore.getState().theme === "system") {
      applyTheme("system")
    }
  }
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handleChange)
  } else {
    media.addListener(handleChange)
  }
}

export const themeSelectors = {
  theme: (state: ThemeState) => state.theme,
  setTheme: (state: ThemeState) => state.setTheme
}
