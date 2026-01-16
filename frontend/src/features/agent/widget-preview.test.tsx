/// <reference types="@testing-library/jest-dom" />
import { describe, it } from "@jest/globals"
import { render, screen } from "@testing-library/react"

import { WidgetPreview } from "./widget-preview"

const defaultProps = {
  title: "Test Widget",
  subtitle: "Ready to help",
  iconUrl: null,
  emptyTitle: "What would you like to do?",
  emptyDescription: "Ask a question or request help.",
  inputPlaceholder: "Ask something…",
  primaryColor: null,
  textColor: null,
  backgroundColor: null,
  borderWidthContainer: null,
  borderWidthMessage: null,
  borderWidthButton: null
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
    render(<WidgetPreview {...defaultProps} iconUrl="https://example.com/icon.png" />)

    const images = screen.getAllByRole("img", { name: "Widget icon" })
    expect(images.length).toBeGreaterThan(0)
    expect(images[0]).toHaveAttribute("src", "https://example.com/icon.png")
  })

  it("applies custom primary color to accent elements", () => {
    const { container } = render(<WidgetPreview {...defaultProps} primaryColor="#ff5500" />)

    const sendButton = container.querySelector("button[disabled]")
    expect(sendButton).toHaveStyle({ backgroundColor: "#ff5500" })
  })

  it("applies custom background color to panel", () => {
    const { container } = render(<WidgetPreview {...defaultProps} backgroundColor="#eeffee" />)

    const panel = container.querySelector(".rounded-2xl")
    expect(panel).toHaveStyle({ backgroundColor: "#eeffee" })
  })

  it("applies custom text color to panel", () => {
    const { container } = render(<WidgetPreview {...defaultProps} textColor="#112233" />)

    const panel = container.querySelector(".rounded-2xl")
    expect(panel).toHaveStyle({ color: "#112233" })
  })

  it("applies custom border widths", () => {
    const { container } = render(
      <WidgetPreview
        {...defaultProps}
        borderWidthContainer={3}
        borderWidthMessage={2}
        borderWidthButton={1}
      />
    )

    const toggleButton = container.querySelector(".rounded-full")
    expect(toggleButton).toHaveStyle({ borderWidth: "3px" })

    const sendButton = container.querySelector("button[disabled]")
    expect(sendButton).toHaveStyle({ borderWidth: "1px" })
  })

  it("uses default border widths when not provided", () => {
    const { container } = render(<WidgetPreview {...defaultProps} />)

    const toggleButton = container.querySelector(".rounded-full")
    expect(toggleButton).toHaveStyle({ borderWidth: "1px" })

    const sendButton = container.querySelector("button[disabled]")
    expect(sendButton).toHaveStyle({ borderWidth: "1px" })
  })

  it("renders toggle button label", () => {
    render(<WidgetPreview {...defaultProps} />)

    expect(screen.getByText("Toggle button")).not.toBeNull()
  })
})
