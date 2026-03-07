import fs from "node:fs"
import path from "node:path"

import { fireEvent, waitFor } from "@testing-library/react"

const AGENT_ID = "widget-agent-id"
const SCRIPT_SRC = "http://localhost:5173/widget/agent.js"
const WIDGET_CONTAINER_ID = "cta-widget-container"
const UI_STORAGE_KEY = "cta_widget_ui_state"
const PAGE_PUSH_OFFSET_VAR = "--cta-widget-push-offset"
const PAGE_PUSH_ACTIVE_ATTR = "data-cta-widget-push-active"

const widgetSource = fs.readFileSync(path.resolve(process.cwd(), "public/widget/agent.js"), "utf8")

type WidgetConfig = {
  actionsRemaining?: number
  isWidgetHidden?: boolean
  widgetBehavior?: "overlay" | "push"
  widgetTitle?: string
  widgetInputPlaceholder?: string
  securityDisclosureEnabled?: boolean
}

type WidgetDom = {
  close: HTMLButtonElement
  handle: HTMLElement
  host: HTMLElement
  panel: HTMLDivElement
  toggle: HTMLButtonElement
}

function createConfig(overrides: WidgetConfig = {}): Required<WidgetConfig> {
  return {
    actionsRemaining: 5,
    isWidgetHidden: false,
    securityDisclosureEnabled: true,
    widgetBehavior: "overlay",
    widgetInputPlaceholder: "Ask Warpy…",
    widgetTitle: "Warpy",
    ...overrides,
  }
}

function setViewport(width: number, height = 900) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  })
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
    writable: true,
  })
}

function createJsonResponse(body: unknown) {
  return {
    json: async () => body,
    ok: true,
  }
}

function dispatchPointer(
  target: Element,
  type: string,
  { button = 0, clientX = 0, clientY = 0, pointerId = 1 }: { button?: number; clientX?: number; clientY?: number; pointerId?: number } = {}
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button,
    cancelable: true,
    clientX,
    clientY,
  })
  Object.defineProperty(event, "pointerId", { value: pointerId })
  target.dispatchEvent(event)
}

function readUiState() {
  return JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || "{}") as { panelWidth?: number }
}

function getWidth(panel: HTMLDivElement) {
  return Number.parseInt(panel.style.width || "0", 10)
}

async function loadWidget(configOverrides: WidgetConfig = {}): Promise<WidgetDom> {
  const config = createConfig(configOverrides)
  ;(global.fetch as jest.Mock).mockImplementation(async () => createJsonResponse(config))

  const script = document.createElement("script")
  script.src = SCRIPT_SRC
  script.setAttribute("data-agent-id", AGENT_ID)
  document.body.appendChild(script)

  window.eval(widgetSource)

  const host = await waitFor(() => {
    const value = document.getElementById(WIDGET_CONTAINER_ID)
    expect(value).not.toBeNull()
    return value as HTMLElement
  })
  const shadowRoot = host.shadowRoot
  expect(shadowRoot).not.toBeNull()

  return {
    close: shadowRoot?.querySelector(".cta-widget-close") as HTMLButtonElement,
    handle: shadowRoot?.querySelector(".cta-widget-resize-rail") as HTMLElement,
    host,
    panel: shadowRoot?.querySelector(".cta-widget-panel") as HTMLDivElement,
    toggle: shadowRoot?.querySelector(".cta-widget-toggle") as HTMLButtonElement,
  }
}

async function openPanel(widget: WidgetDom) {
  fireEvent.click(widget.toggle)
  await waitFor(() => {
    expect(widget.panel.classList.contains("open")).toBe(true)
  })
}

describe("widget desktop resize", () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch
    document.head.innerHTML = ""
    document.body.innerHTML = ""
    document.documentElement.removeAttribute(PAGE_PUSH_ACTIVE_ATTR)
    document.documentElement.style.removeProperty(PAGE_PUSH_OFFSET_VAR)
    localStorage.clear()
    sessionStorage.clear()
    setViewport(1280, 900)
  })

  it("keeps the current width as the minimum, supports resizing, and persists the chosen width", async () => {
    const widget = await loadWidget()
    await openPanel(widget)

    expect(getWidth(widget.panel)).toBe(440)
    expect(widget.handle.getAttribute("aria-disabled")).toBe("false")

    dispatchPointer(widget.handle, "pointerdown", { clientX: 240, pointerId: 1 })
    dispatchPointer(widget.handle, "pointermove", { clientX: 100, pointerId: 1 })
    dispatchPointer(widget.handle, "pointerup", { clientX: 100, pointerId: 1 })

    expect(getWidth(widget.panel)).toBe(580)
    expect(readUiState().panelWidth).toBe(580)

    dispatchPointer(widget.handle, "pointerdown", { clientX: 100, pointerId: 2 })
    dispatchPointer(widget.handle, "pointermove", { clientX: 420, pointerId: 2 })
    dispatchPointer(widget.handle, "pointerup", { clientX: 420, pointerId: 2 })

    expect(getWidth(widget.panel)).toBe(440)
    expect(readUiState().panelWidth).toBe(440)

    fireEvent.keyDown(widget.handle, { key: "ArrowLeft" })
    expect(getWidth(widget.panel)).toBe(472)

    fireEvent.keyDown(widget.handle, { key: "Home" })
    expect(getWidth(widget.panel)).toBe(680)

    fireEvent.keyDown(widget.handle, { key: "End" })
    expect(getWidth(widget.panel)).toBe(440)
    expect(readUiState().panelWidth).toBe(440)

    fireEvent.keyDown(widget.handle, { key: "Home" })
    expect(getWidth(widget.panel)).toBe(680)
    expect(readUiState().panelWidth).toBe(680)

    sessionStorage.clear()
    document.head.innerHTML = ""
    document.body.innerHTML = ""

    const reloaded = await loadWidget()
    await openPanel(reloaded)

    expect(getWidth(reloaded.panel)).toBe(680)
  })

  it("updates push mode offset live as the panel width changes and clears it on close", async () => {
    const widget = await loadWidget({ widgetBehavior: "push" })
    await openPanel(widget)

    expect(document.documentElement.style.getPropertyValue(PAGE_PUSH_OFFSET_VAR)).toBe("440px")

    fireEvent.keyDown(widget.handle, { key: "Home" })

    expect(document.documentElement.style.getPropertyValue(PAGE_PUSH_OFFSET_VAR)).toBe("680px")

    fireEvent.click(widget.close)

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue(PAGE_PUSH_OFFSET_VAR)).toBe("")
    })
    expect(document.documentElement.hasAttribute(PAGE_PUSH_ACTIVE_ATTR)).toBe(false)
  })

  it("clamps the rendered width on viewport resize and disables resizing on mobile widths", async () => {
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ panelWidth: 680 }))

    const widget = await loadWidget()
    await openPanel(widget)

    expect(getWidth(widget.panel)).toBe(680)

    setViewport(700, 900)
    window.dispatchEvent(new Event("resize"))

    await waitFor(() => {
      expect(getWidth(widget.panel)).toBe(644)
    })

    setViewport(640, 900)
    window.dispatchEvent(new Event("resize"))

    await waitFor(() => {
      expect(widget.handle.getAttribute("aria-disabled")).toBe("true")
    })
    expect(widget.handle.tabIndex).toBe(-1)
    expect(widget.handle.classList.contains("active")).toBe(false)
    expect(widget.panel.style.width).toBe("")
  })
})
