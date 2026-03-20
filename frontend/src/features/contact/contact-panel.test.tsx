/// <reference types="@testing-library/jest-dom" />
import { describe, it } from "@jest/globals"
import { render, screen } from "@testing-library/react"

import { ContactPanel } from "./contact-panel"

describe("ContactPanel", () => {
  it("directs users to email support and Discord", () => {
    render(<ContactPanel />)

    expect(screen.getByRole("heading", { name: "Contact Us" })).not.toBeNull()
    expect(screen.getByText(/For all support inquiries/i)).not.toBeNull()

    expect(screen.getByRole("link", { name: "support@warpy.ai" })).toHaveAttribute("href", "mailto:support@warpy.ai")
    expect(screen.getByRole("link", { name: "Email support" })).toHaveAttribute("href", "mailto:support@warpy.ai")
    expect(screen.getByRole("link", { name: "Discord" })).toHaveAttribute("href", "https://discord.gg/JPjYjPdGD2")
    expect(screen.getByRole("link", { name: "Join Discord" })).toHaveAttribute("href", "https://discord.gg/JPjYjPdGD2")
  })
})
