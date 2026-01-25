require("@testing-library/jest-dom")

jest.mock("react-markdown", () => {
  const React = require("react")
  return {
    __esModule: true,
    default: function Markdown({ children }) {
      return React.createElement("div", { "data-testid": "markdown-content" }, children)
    }
  }
})

process.env.VITE_CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "test-pk"
process.env.VITE_API_URL = process.env.VITE_API_URL ?? "http://localhost:8000"
process.env.VITE_API_TIMEOUT_MS = process.env.VITE_API_TIMEOUT_MS ?? "5000"
process.env.VITE_WIDGET_CDN_URL = process.env.VITE_WIDGET_CDN_URL ?? "http://localhost:5173/widget/agent.js"

if (!("fetch" in global)) {
  Object.defineProperty(global, "fetch", {
    writable: true,
    configurable: true,
    value: jest.fn()
  })
}

if (!global.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserver
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {}
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {}
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
