/// <reference types="@testing-library/jest-dom" />
import { describe, it } from "@jest/globals"
import { render, screen } from "@testing-library/react"

import { widgetStylesDefault } from "@/types/widget-styles"
import { WidgetPreview } from "./widget-preview"

const defaultProps = {
  widgetTitle: "Test Widget",
  widgetSubtitle: "Ready to help",
  widgetIconUrl: null,
  widgetEmptyTitle: "What would you like to do?",
  widgetEmptyDescription: "Ask a question or request help.",
  widgetInputPlaceholder: "Ask something…",
  widgetSecurityDisclosureEnabled: true,
  widgetStyles: null
}

describe("WidgetPreview", () => {
  it("renders title and subtitle", () => {
    render(<WidgetPreview {...defaultProps} />)

    expect(screen.getByText("Test Widget")).not.toBeNull()
    expect(screen.getByText("Ready to help")).not.toBeNull()
  })

  it("renders input placeholder", () => {
    render(<WidgetPreview {...defaultProps} />)

    expect(screen.getByText("Ask something…")).not.toBeNull()
  })

  it("renders static demo messages", () => {
    render(<WidgetPreview {...defaultProps} />)

    expect(screen.getByText("Can you help me track my order?")).not.toBeNull()
    expect(
      screen.getByText(
        "Of course! I can help you track your order. Please provide your order number."
      )
    ).not.toBeNull()
  })

  it("renders default sparkles icon when iconUrl is null", () => {
    render(<WidgetPreview {...defaultProps} />)

    // Should have sparkles icons (SVG), no img elements
    expect(screen.queryByRole("img")).toBeNull()
  })

  it("renders custom icon when iconUrl is provided", () => {
    render(<WidgetPreview {...defaultProps} widgetIconUrl="https://example.com/icon.png" />)

    const images = screen.getAllByRole("img", { name: "Widget icon" })
    expect(images.length).toBeGreaterThan(0)
    expect(images[0]).toHaveAttribute("src", "https://example.com/icon.png")
  })

  it("applies custom primary color to accent elements", () => {
    const customStyles = {
      ...widgetStylesDefault,
      colors: { ...widgetStylesDefault.colors, primary: "#ff5500" }
    }
    const { container } = render(<WidgetPreview {...defaultProps} widgetStyles={customStyles} />)

    const sendButton = container.querySelector("button[disabled]")
    expect(sendButton).toHaveStyle({ backgroundColor: "#ff5500" })
  })

  it("applies custom border widths", () => {
    const customStyles = {
      ...widgetStylesDefault,
      borders: { ...widgetStylesDefault.borders, containerWidth: 3, buttonWidth: 2 }
    }
    const { container } = render(<WidgetPreview {...defaultProps} widgetStyles={customStyles} />)

    const toggleButton = container.querySelector(".rounded-full")
    expect(toggleButton).toHaveStyle({ borderWidth: "3px" })

    const sendButton = container.querySelector("button[disabled]")
    expect(sendButton).toHaveStyle({ borderWidth: "2px" })
  })

  it("renders toggle button label", () => {
    render(<WidgetPreview {...defaultProps} />)

    expect(screen.getByText("Toggle button")).not.toBeNull()
  })
})
