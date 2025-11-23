import { create } from "zustand"

type Theme = "light" | "dark"

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const themeKey = "theme"

const getThemeFromCookie = (): Theme | null => {
  if (typeof document === "undefined") {
    return null
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${themeKey}=(light|dark)`))
  return (match?.[1] as Theme) ?? null
}

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
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle("dark", theme === "dark")
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

export const themeSelectors = {
  theme: (state: ThemeState) => state.theme,
  setTheme: (state: ThemeState) => state.setTheme
}
