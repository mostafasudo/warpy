import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { themeSelectors, useThemeStore } from "@/stores/theme"

type ThemeToggleProps = {
  className?: string
}

export const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const theme = useThemeStore(themeSelectors.theme)
  const setTheme = useThemeStore(themeSelectors.setTheme)
  const isDark = theme === "dark"

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn("h-10 w-10 rounded-full border-border/80", className)}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
