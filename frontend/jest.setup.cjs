require("@testing-library/jest-dom")

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
