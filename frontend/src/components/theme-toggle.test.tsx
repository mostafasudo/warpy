import { describe, expect, it } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ThemeToggle } from "./theme-toggle"
import { useThemeStore } from "@/stores/theme"

describe("ThemeToggle", () => {
  it("toggles theme state", async () => {
    useThemeStore.setState({ theme: "dark", setTheme: useThemeStore.getState().setTheme })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<ThemeToggle />)

    await user.click(await screen.findByRole("button", { name: /light theme/i }))
    expect(useThemeStore.getState().theme).toBe("light")

    await user.click(await screen.findByRole("button", { name: /system theme/i }))
    expect(useThemeStore.getState().theme).toBe("system")

    await user.click(await screen.findByRole("button", { name: /dark theme/i }))
    expect(useThemeStore.getState().theme).toBe("dark")
  })
})
