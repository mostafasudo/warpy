/// <reference types="@testing-library/jest-dom" />
import { describe, it } from "@jest/globals"
import { render, screen } from "@testing-library/react"

import { ContactPanel } from "./contact-panel"

describe("ContactPanel", () => {
  it("directs users to email, Discord, and scheduling time", () => {
    render(<ContactPanel />)

    expect(screen.getByRole("heading", { name: "Contact Us" })).not.toBeNull()
    expect(screen.getByText("Reach our team by email, in Discord, or book a call.")).not.toBeNull()
    expect(screen.getByText("For all support inquiries, email us at abdel@warpy.ai or join our Discord or book a call.")).not.toBeNull()
    expect(screen.getByRole("link", { name: "Email support" })).toHaveAttribute("href", "mailto:abdel@warpy.ai")
    expect(screen.getByRole("link", { name: "Join Discord" })).toHaveAttribute("href", "https://discord.gg/JPjYjPdGD2")
    expect(screen.getByRole("link", { name: "Book a call" })).toHaveAttribute("href", "https://cal.com/levwtech")
  })
})
