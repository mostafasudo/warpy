import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { themeSelectors, useThemeStore } from "@/stores/theme"

type ThemeToggleProps = {
  className?: string
}

export const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const theme = useThemeStore(themeSelectors.theme)
  const setTheme = useThemeStore(themeSelectors.setTheme)
  const options = [
    { value: "system", label: "System theme", icon: Monitor },
    { value: "light", label: "Light theme", icon: Sun },
    { value: "dark", label: "Dark theme", icon: Moon }
  ] as const

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-muted/60 p-0.5 opacity-60 transition-opacity hover:opacity-100",
        className
      )}
    >
      {options.map((option) => {
        const isActive = theme === option.value
        const Icon = option.icon
        return (
          <Button
            key={option.value}
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setTheme(option.value)}
            aria-label={option.label}
            aria-pressed={isActive}
            className={cn(
              "h-7 w-7 rounded-full text-muted-foreground transition-colors",
              isActive && "bg-background/80 text-foreground shadow-sm"
            )}
          >
            <Icon className="h-4 w-4" />
          </Button>
        )
      })}
    </div>
  )
}
