import fs from "node:fs"
import path from "node:path"

import { act, fireEvent, waitFor } from "@testing-library/react"

const AGENT_ID = "widget-agent-id"
const SCRIPT_SRC = "http://localhost:5173/widget/agent.js"
const WIDGET_CONTAINER_ID = "cta-widget-container"
const STORAGE_KEY = "cta_widget_state"
const UI_STORAGE_KEY = "cta_widget_ui_state"
const PAGE_PUSH_OFFSET_VAR = "--cta-widget-push-offset"
const PAGE_PUSH_ACTIVE_ATTR = "data-cta-widget-push-active"

const widgetSource = fs.readFileSync(path.resolve(process.cwd(), "public/widget/agent.js"), "utf8")

type WidgetConfig = {
  actionsRemaining?: number
  auth?: {
    mode?: "none" | "header"
    source?: "localStorage" | "sessionStorage" | "cookies"
    key?: string
    authType?: "bearer" | "basic" | "none"
  }
  headers?: Record<string, { source: "localStorage" | "sessionStorage" | "cookies"; key: string }>
  isWidgetHidden?: boolean
  sendCookiesWithRequests?: boolean
  widgetStarterSuggestions?: string[]
  widgetSuggestionsEnabled?: boolean
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

type WidgetSocketMessage = {
  type: string
  request?: Record<string, unknown>
  widgetToken?: string
}

type ScrollHarness = {
  getClientHeight: () => number
  getScrollHeight: () => number
  getScrollTop: () => number
  setMetrics: (metrics: { clientHeight?: number; scrollHeight?: number; scrollTop?: number }) => void
}

let scrollIntoViewCalls: string[] = []

class MockWebSocket {
  static CLOSED = 3
  static CLOSING = 2
  static CONNECTING = 0
  static OPEN = 1
  static instances: MockWebSocket[] = []
  static handler: ((socket: MockWebSocket, message: WidgetSocketMessage) => void) | null = null

  static reset() {
    MockWebSocket.instances = []
    MockWebSocket.handler = null
  }

  onclose: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState = MockWebSocket.CONNECTING
  sent: WidgetSocketMessage[] = []
  url: string

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.(new Event("open"))
    }, 0)
  }

  close() {
    if (this.readyState >= MockWebSocket.CLOSING) return
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new Event("close"))
  }

  send(data: string) {
    const parsed = JSON.parse(data) as WidgetSocketMessage
    this.sent.push(parsed)
    MockWebSocket.handler?.(this, parsed)
  }

  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>)
  }

  fail() {
    this.onerror?.(new Event("error"))
  }
}

function createConfig(overrides: WidgetConfig = {}): Required<WidgetConfig> {
  return {
    actionsRemaining: 5,
    auth: { mode: "none" },
    headers: {},
    isWidgetHidden: false,
    sendCookiesWithRequests: false,
    securityDisclosureEnabled: true,
    widgetBehavior: "overlay",
    widgetInputPlaceholder: "Ask Warpy…",
    widgetStarterSuggestions: [],
    widgetSuggestionsEnabled: false,
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
  const raw = JSON.stringify(body)
  return {
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    ok: true,
    status: 200,
    text: async () => raw,
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

function readWidgetState() {
  return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") as {
    activeQuery?: string | null
    activeRequestId?: string | null
    conversationId?: string | null
    firstUnreadMessageId?: string | null
    interruptedByNavigation?: boolean
    lastReadMessageId?: string | null
    messageCursor?: number
    messages?: Array<{ id?: string; role: string; content: string }>
    resumePanelOpen?: boolean | null
    version?: number
  }
}

function getWidth(panel: HTMLDivElement) {
  return Number.parseInt(panel.style.width || "0", 10)
}

function getMessagesScroller(widget: WidgetDom) {
  return getShadowRoot(widget).querySelector(".cta-widget-messages") as HTMLDivElement
}

function attachScrollHarness(element: HTMLElement): ScrollHarness {
  let clientHeight = 0
  let scrollHeight = 0
  let scrollTop = 0

  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  })
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  })
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Number(value) || 0
    },
  })

  return {
    getClientHeight: () => clientHeight,
    getScrollHeight: () => scrollHeight,
    getScrollTop: () => scrollTop,
    setMetrics: (metrics) => {
      if (typeof metrics.clientHeight === "number") clientHeight = metrics.clientHeight
      if (typeof metrics.scrollHeight === "number") scrollHeight = metrics.scrollHeight
      if (typeof metrics.scrollTop === "number") scrollTop = metrics.scrollTop
    },
  }
}

function assignRect(
  element: Element,
  { top, bottom, left = 0, right = 320 }: { top: number; bottom: number; left?: number; right?: number }
) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      top,
      bottom,
      left,
      right,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
  })
}

async function loadWidget(
  configOverrides: WidgetConfig = {},
  options: { baseUrl?: string, mockConfigFetch?: boolean } = {}
): Promise<WidgetDom> {
  const config = createConfig(configOverrides)
  if (options.mockConfigFetch !== false) {
    ;(global.fetch as jest.Mock).mockImplementation(async () => createJsonResponse(config))
  }

  const script = document.createElement("script")
  script.src = SCRIPT_SRC
  script.setAttribute("data-agent-id", AGENT_ID)
  script.setAttribute("data-base-url", options.baseUrl ?? "http://localhost:8000")
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

function getShadowRoot(widget: WidgetDom) {
  const shadowRoot = widget.host.shadowRoot
  expect(shadowRoot).not.toBeNull()
  return shadowRoot as ShadowRoot
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
    ;(global as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket
    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    })
    MockWebSocket.reset()
    document.head.innerHTML = ""
    document.body.innerHTML = ""
    document.documentElement.removeAttribute(PAGE_PUSH_ACTIVE_ATTR)
    document.documentElement.style.removeProperty(PAGE_PUSH_OFFSET_VAR)
    localStorage.clear()
    sessionStorage.clear()
    setViewport(1280, 900)
    scrollIntoViewCalls = []
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: jest.fn(function (this: HTMLElement) {
        const marker = this.dataset.messageId || this.className || this.textContent || this.tagName
        scrollIntoViewCalls.push(String(marker))
      }),
    })
  })

  it("keeps the current width as the default, supports resizing narrower, and persists the chosen width", async () => {
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

    expect(getWidth(widget.panel)).toBe(344)
    expect(readUiState().panelWidth).toBe(344)

    fireEvent.keyDown(widget.handle, { key: "ArrowLeft" })
    expect(getWidth(widget.panel)).toBe(376)

    fireEvent.keyDown(widget.handle, { key: "Home" })
    expect(getWidth(widget.panel)).toBe(680)

    fireEvent.keyDown(widget.handle, { key: "End" })
    expect(getWidth(widget.panel)).toBe(344)
    expect(readUiState().panelWidth).toBe(344)

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

  it("renders starter suggestions, sends clicked suggestions immediately, and swaps in dynamic suggestions", async () => {
    const config = createConfig({
      widgetSuggestionsEnabled: true,
      widgetStarterSuggestions: ["Show recent invoices", "Create a refund"]
    })

    ;(global.fetch as jest.Mock).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/widget/config/")) {
        return createJsonResponse(config)
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    MockWebSocket.handler = (socket, message) => {
      expect(socket.url).toBe("ws://localhost:8000/widget/session")
      expect(message.type).toBe("chat.request")
      expect(message.request).toMatchObject({
        agentId: AGENT_ID,
        conversationId: null,
        message: "Create a refund",
      })
      socket.receive({ type: "keepalive" })
      socket.receive({
        type: "chat.response",
        response: {
          conversationId: "conversation-1",
          messages: [{ role: "assistant", content: "Here is the update." }],
          toolCalls: [],
          suggestions: ["Send it to finance", "Create another invoice"],
          done: true,
          isWidgetHidden: false,
          actionsRemaining: 5,
        },
      })
    }

    const widget = await loadWidget({}, { mockConfigFetch: false })
    await openPanel(widget)
    const shadowRoot = getShadowRoot(widget)

    await waitFor(() => {
      expect(shadowRoot.querySelector(".cta-widget-suggestion")?.textContent).toBe("Show recent invoices")
    })

    const starterButton = Array.from(shadowRoot.querySelectorAll(".cta-widget-suggestion")).find(
      (element) => element.textContent === "Create a refund"
    ) as HTMLButtonElement | undefined
    expect(starterButton).toBeDefined()
    fireEvent.click(starterButton!)

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1)
      expect(MockWebSocket.instances[0]?.sent).toHaveLength(1)
    })

    await waitFor(() => {
      const suggestionTexts = Array.from(shadowRoot.querySelectorAll(".cta-widget-suggestion")).map((element) => element.textContent)
      expect(suggestionTexts).toEqual(["Send it to finance", "Create another invoice"])
    })
    expect(shadowRoot.textContent).toContain("Here is the update.")
  })

  it("migrates legacy stored messages by assigning ids and marking the history as read", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      messages: [
        { role: "user", content: "Legacy user message" },
        { role: "assistant", content: "Legacy assistant message" },
      ],
      conversationId: "conversation-legacy",
      voice: {},
      auth: {},
      ui: {},
      suggestions: [],
    }))

    await loadWidget()

    const migrated = readWidgetState()
    expect(migrated.version).toBe(2)
    expect(migrated.messages?.map((message) => message.id)).toEqual(["msg_1", "msg_2"])
    expect(migrated.lastReadMessageId).toBe("msg_2")
    expect(migrated.firstUnreadMessageId).toBeNull()
    expect(migrated.messageCursor).toBe(3)
  })

  it("opens a read conversation at the bottom instead of fabricating unread state", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      messageCursor: 4,
      messages: [
        { id: "msg_1", role: "user", content: "First" },
        { id: "msg_2", role: "assistant", content: "Second" },
        { id: "msg_3", role: "assistant", content: "Third" },
      ],
      conversationId: "conversation-read",
      voice: {},
      auth: {},
      ui: {},
      suggestions: [],
      lastReadMessageId: "msg_3",
      firstUnreadMessageId: null,
    }))

    const widget = await loadWidget()
    const scrollHarness = attachScrollHarness(getMessagesScroller(widget))
    scrollHarness.setMetrics({ clientHeight: 180, scrollHeight: 720, scrollTop: 0 })

    await openPanel(widget)

    expect(scrollHarness.getScrollTop()).toBe(720)
    expect(scrollIntoViewCalls.some((entry) => entry.includes("cta-widget-unread-divider"))).toBe(false)
    expect(getShadowRoot(widget).querySelector(".cta-widget-unread-divider-label")).toBeNull()
    expect(readWidgetState().firstUnreadMessageId).toBeNull()
  })

  it("opens at the unread divider when unread assistant messages are waiting", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      messageCursor: 5,
      messages: [
        { id: "msg_1", role: "user", content: "What changed?" },
        { id: "msg_2", role: "assistant", content: "Everything looked good." },
        { id: "msg_3", role: "assistant", content: "There is also one unread update." },
        { id: "msg_4", role: "assistant", content: "And another unread update." },
      ],
      conversationId: "conversation-unread",
      voice: {},
      auth: {},
      ui: {},
      suggestions: [],
      lastReadMessageId: "msg_2",
      firstUnreadMessageId: "msg_3",
    }))

    const widget = await loadWidget()
    const scrollHarness = attachScrollHarness(getMessagesScroller(widget))
    scrollHarness.setMetrics({ clientHeight: 180, scrollHeight: 720, scrollTop: 0 })

    expect(widget.toggle.classList.contains("has-unread")).toBe(true)

    await openPanel(widget)

    expect(scrollIntoViewCalls.some((entry) => entry.includes("cta-widget-unread-divider"))).toBe(true)
    expect((getShadowRoot(widget).querySelector(".cta-widget-unread-divider-label") as HTMLSpanElement).textContent).toBe("New")
    expect((getShadowRoot(widget).querySelector(".cta-widget-jump") as HTMLButtonElement).getAttribute("aria-label")).toBe("Jump to latest")
    expect(widget.toggle.classList.contains("has-unread")).toBe(false)

    fireEvent.click(widget.close)

    await waitFor(() => {
      expect(widget.panel.classList.contains("open")).toBe(false)
    })
    expect(widget.toggle.classList.contains("has-unread")).toBe(true)
  })

  it("shows jump to latest for unread conversations and clears unread when clicked", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      messageCursor: 5,
      messages: [
        { id: "msg_1", role: "user", content: "What changed?" },
        { id: "msg_2", role: "assistant", content: "Everything looked good." },
        { id: "msg_3", role: "assistant", content: "There is also one unread update." },
        { id: "msg_4", role: "assistant", content: "And another unread update." },
      ],
      conversationId: "conversation-jump",
      voice: {},
      auth: {},
      ui: {},
      suggestions: [],
      lastReadMessageId: "msg_2",
      firstUnreadMessageId: "msg_3",
    }))

    const widget = await loadWidget()
    const scrollHarness = attachScrollHarness(getMessagesScroller(widget))
    scrollHarness.setMetrics({ clientHeight: 180, scrollHeight: 720, scrollTop: 0 })

    await openPanel(widget)

    const shadowRoot = getShadowRoot(widget)
    const jumpButton = shadowRoot.querySelector(".cta-widget-jump") as HTMLButtonElement
    const jumpWrap = shadowRoot.querySelector(".cta-widget-jump-wrap") as HTMLDivElement
    expect(jumpWrap.classList.contains("visible")).toBe(true)

    fireEvent.click(jumpButton)

    await waitFor(() => {
      expect(scrollHarness.getScrollTop()).toBe(720)
    })
    expect(jumpWrap.classList.contains("visible")).toBe(false)
    expect(readWidgetState().firstUnreadMessageId).toBeNull()
    expect(getShadowRoot(widget).querySelector(".cta-widget-unread-divider-label")).toBeNull()
  })

  it("advances the unread anchor after the user reads part of an unread block", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        messageCursor: 5,
        messages: [
          { id: "msg_1", role: "user", content: "What changed?" },
          { id: "msg_2", role: "assistant", content: "Everything looked good." },
          { id: "msg_3", role: "assistant", content: "Unread update one." },
          { id: "msg_4", role: "assistant", content: "Unread update two." },
        ],
        conversationId: "conversation-partial-read",
        voice: {},
        auth: {},
        ui: {},
        suggestions: [],
        lastReadMessageId: "msg_2",
        firstUnreadMessageId: "msg_3",
      })
    )

    const widget = await loadWidget()
    const scrollHarness = attachScrollHarness(getMessagesScroller(widget))
    scrollHarness.setMetrics({ clientHeight: 180, scrollHeight: 720, scrollTop: 0 })

    await openPanel(widget)

    const shadowRoot = getShadowRoot(widget)
    const scroller = getMessagesScroller(widget)
    const firstUnreadNode = shadowRoot.querySelector('[data-message-id="msg_3"]') as HTMLDivElement
    const secondUnreadNode = shadowRoot.querySelector('[data-message-id="msg_4"]') as HTMLDivElement

    assignRect(scroller, { top: 0, bottom: 180 })
    assignRect(firstUnreadNode, { top: -56, bottom: -8 })
    assignRect(secondUnreadNode, { top: 24, bottom: 88 })

    scrollHarness.setMetrics({ scrollTop: 260 })
    fireEvent.scroll(scroller)

    await waitFor(() => {
      expect(readWidgetState().lastReadMessageId).toBe("msg_3")
      expect(readWidgetState().firstUnreadMessageId).toBe("msg_4")
    })

    scrollIntoViewCalls = []
    fireEvent.click(widget.close)
    await waitFor(() => {
      expect(widget.panel.classList.contains("open")).toBe(false)
    })

    await openPanel(widget)

    expect(scrollIntoViewCalls.some((entry) => entry.includes("cta-widget-unread-divider"))).toBe(true)
    expect(readWidgetState().firstUnreadMessageId).toBe("msg_4")
  })

  it("pins back to the bottom when sending a suggestion from a long chat", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      messageCursor: 4,
      messages: [
        { id: "msg_1", role: "user", content: "Start" },
        { id: "msg_2", role: "assistant", content: "Middle" },
        { id: "msg_3", role: "assistant", content: "Latest" },
      ],
      conversationId: "conversation-suggestions",
      voice: {},
      auth: {},
      ui: {},
      suggestions: ["Create another refund", "Summarize invoices"],
      lastReadMessageId: "msg_3",
      firstUnreadMessageId: null,
    }))

    MockWebSocket.handler = () => {
    }

    const widget = await loadWidget({ widgetSuggestionsEnabled: true })
    const scrollHarness = attachScrollHarness(getMessagesScroller(widget))
    scrollHarness.setMetrics({ clientHeight: 180, scrollHeight: 920, scrollTop: 120 })

    await openPanel(widget)

    const shadowRoot = getShadowRoot(widget)
    const suggestionButton = Array.from(shadowRoot.querySelectorAll(".cta-widget-suggestion")).find(
      (element) => element.textContent === "Create another refund"
    ) as HTMLButtonElement | undefined
    expect(suggestionButton).toBeDefined()

    fireEvent.click(suggestionButton!)

    await waitFor(() => {
      expect(readWidgetState().activeRequestId).toBeTruthy()
    })
    expect(scrollHarness.getScrollTop()).toBe(920)
    expect(readWidgetState().firstUnreadMessageId).toBeNull()
  })

  it("keeps Warpy widget routes on the Warpy API even when a customer base URL is configured", async () => {
    const config = createConfig()

    ;(global.fetch as jest.Mock).mockImplementation(async (input) => {
      const url = String(input)
      expect(url).toBe(`http://localhost:8000/widget/config/${AGENT_ID}`)
      if (url.includes("/widget/config/")) {
        return createJsonResponse(config)
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    MockWebSocket.handler = (socket, message) => {
      expect(socket.url).toBe("ws://localhost:8000/widget/session")
      expect(message.type).toBe("chat.request")
      socket.receive({
        type: "chat.response",
        response: {
          conversationId: "conversation-1",
          messages: [{ role: "assistant", content: "Done." }],
          toolCalls: [],
          suggestions: [],
          done: true,
          isWidgetHidden: false,
          actionsRemaining: 5,
        },
      })
    }

    const widget = await loadWidget({}, { baseUrl: "https://example.com/api", mockConfigFetch: false })
    await openPanel(widget)

    const shadowRoot = getShadowRoot(widget)
    const input = shadowRoot.querySelector(".cta-widget-input") as HTMLTextAreaElement
    const send = shadowRoot.querySelector(".cta-widget-send") as HTMLButtonElement
    fireEvent.change(input, { target: { value: "Hello" } })
    fireEvent.click(send)

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1)
      expect(MockWebSocket.instances[0]?.url).toBe("ws://localhost:8000/widget/session")
    })
  })

  it("sends tool results over the same websocket in the original order", async () => {
    ;(global.fetch as jest.Mock).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/widget/config/")) {
        return createJsonResponse(createConfig())
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    MockWebSocket.handler = (socket, message) => {
      const request = message.request || {}
      if (request.message) {
        socket.receive({
          type: "chat.response",
          response: {
            conversationId: "conversation-3",
            messages: [],
            toolCalls: [
              { id: "tc_1", type: "find_elements", name: "find_elements", findQuery: "save button" },
              { id: "tc_2", type: "find_elements", name: "find_elements", findQuery: "cancel button" },
            ],
            suggestions: [],
            done: false,
            isWidgetHidden: false,
            actionsRemaining: 5,
          },
        })
        return
      }

      expect(request).toMatchObject({
        agentId: AGENT_ID,
        conversationId: "conversation-3",
      })
      expect(request.toolResults).toEqual([
        { id: "tc_1", statusCode: 200, body: expect.any(Object) },
        { id: "tc_2", statusCode: 200, body: expect.any(Object) },
      ])
      socket.receive({
        type: "chat.response",
        response: {
          conversationId: "conversation-3",
          messages: [{ role: "assistant", content: "Finished." }],
          toolCalls: [],
          suggestions: [],
          done: true,
          isWidgetHidden: false,
          actionsRemaining: 5,
        },
      })
    }

    const widget = await loadWidget()
    await openPanel(widget)
    const shadowRoot = getShadowRoot(widget)
    const input = shadowRoot.querySelector(".cta-widget-input") as HTMLTextAreaElement
    const send = shadowRoot.querySelector(".cta-widget-send") as HTMLButtonElement

    fireEvent.change(input, { target: { value: "Check the page" } })
    fireEvent.click(send)

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1)
      expect(MockWebSocket.instances[0]?.sent).toHaveLength(2)
      expect(shadowRoot.textContent).toContain("Finished.")
    })
  })

  it("uses request credentials when browser cookie sending is enabled", async () => {
    ;(global.fetch as jest.Mock).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes("/widget/config/")) {
        return createJsonResponse(createConfig({ sendCookiesWithRequests: true }))
      }
      if (url === "https://customer.example/me") {
        expect(init).toEqual(expect.objectContaining({ credentials: "include", method: "GET" }))
        expect(new Headers(init?.headers).get("Authorization")).toBeNull()
        return createJsonResponse({ ok: true })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    MockWebSocket.handler = (socket, message) => {
      const request = message.request || {}
      if (request.message) {
        socket.receive({
          type: "chat.response",
          response: {
            conversationId: "conversation-cookie-auth",
            messages: [],
            toolCalls: [{ id: "tc_1", type: "backend", name: "get_profile", method: "GET", path: "/me" }],
            suggestions: [],
            done: false,
            isWidgetHidden: false,
            actionsRemaining: 5,
          },
        })
        return
      }

      expect(request.toolResults).toEqual([{ id: "tc_1", statusCode: 200, body: { ok: true } }])
      socket.receive({
        type: "chat.response",
        response: {
          conversationId: "conversation-cookie-auth",
          messages: [{ role: "assistant", content: "Cookie auth finished." }],
          toolCalls: [],
          suggestions: [],
          done: true,
          isWidgetHidden: false,
          actionsRemaining: 5,
        },
      })
    }

    const widget = await loadWidget({ sendCookiesWithRequests: true }, { baseUrl: "https://customer.example", mockConfigFetch: false })
    await openPanel(widget)
    const shadowRoot = getShadowRoot(widget)
    const input = shadowRoot.querySelector(".cta-widget-input") as HTMLTextAreaElement
    const send = shadowRoot.querySelector(".cta-widget-send") as HTMLButtonElement

    fireEvent.change(input, { target: { value: "Use cookies" } })
    fireEvent.click(send)

    await waitFor(() => {
      expect(shadowRoot.textContent).toContain("Cookie auth finished.")
    })
  })

  it("adds the configured Authorization header when header auth is enabled", async () => {
    localStorage.setItem("session_token", "abc123")

    ;(global.fetch as jest.Mock).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes("/widget/config/")) {
        return createJsonResponse(
          createConfig({
            auth: { mode: "header", source: "localStorage", key: "session_token", authType: "basic" }
          })
        )
      }
      if (url === "https://customer.example/me") {
        const headers = new Headers(init?.headers)
        expect(headers.get("Authorization")).toBe("Basic abc123")
        expect(init?.credentials).toBeUndefined()
        return createJsonResponse({ ok: true })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    MockWebSocket.handler = (socket, message) => {
      const request = message.request || {}
      if (request.message) {
        socket.receive({
          type: "chat.response",
          response: {
            conversationId: "conversation-header-auth",
            messages: [],
            toolCalls: [{ id: "tc_1", type: "backend", name: "get_profile", method: "GET", path: "/me" }],
            suggestions: [],
            done: false,
            isWidgetHidden: false,
            actionsRemaining: 5,
          },
        })
        return
      }

      expect(request.toolResults).toEqual([{ id: "tc_1", statusCode: 200, body: { ok: true } }])
      socket.receive({
        type: "chat.response",
        response: {
          conversationId: "conversation-header-auth",
          messages: [{ role: "assistant", content: "Header auth finished." }],
          toolCalls: [],
          suggestions: [],
          done: true,
          isWidgetHidden: false,
          actionsRemaining: 5,
        },
      })
    }

    const widget = await loadWidget(
      { auth: { mode: "header", source: "localStorage", key: "session_token", authType: "basic" } },
      { baseUrl: "https://customer.example", mockConfigFetch: false }
    )
    await openPanel(widget)
    const shadowRoot = getShadowRoot(widget)
    const input = shadowRoot.querySelector(".cta-widget-input") as HTMLTextAreaElement
    const send = shadowRoot.querySelector(".cta-widget-send") as HTMLButtonElement

    fireEvent.change(input, { target: { value: "Use header auth" } })
    fireEvent.click(send)

    await waitFor(() => {
      expect(shadowRoot.textContent).toContain("Header auth finished.")
    })
  })

  it("preserves legacy cookie-backed Authorization headers when provided by widget config", async () => {
    document.cookie = "legacy_cookie=abc123"

    ;(global.fetch as jest.Mock).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes("/widget/config/")) {
        return createJsonResponse(
          createConfig({
            auth: { mode: "header", source: "cookies", key: "legacy_cookie", authType: "bearer" }
          })
        )
      }
      if (url === "https://customer.example/me") {
        const headers = new Headers(init?.headers)
        expect(headers.get("Authorization")).toBe("Bearer abc123")
        expect(init?.credentials).toBeUndefined()
        return createJsonResponse({ ok: true })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    MockWebSocket.handler = (socket, message) => {
      const request = message.request || {}
      if (request.message) {
        socket.receive({
          type: "chat.response",
          response: {
            conversationId: "conversation-cookie-header-auth",
            messages: [],
            toolCalls: [{ id: "tc_1", type: "backend", name: "get_profile", method: "GET", path: "/me" }],
            suggestions: [],
            done: false,
            isWidgetHidden: false,
            actionsRemaining: 5,
          },
        })
        return
      }

      expect(request.toolResults).toEqual([{ id: "tc_1", statusCode: 200, body: { ok: true } }])
      socket.receive({
        type: "chat.response",
        response: {
          conversationId: "conversation-cookie-header-auth",
          messages: [{ role: "assistant", content: "Legacy cookie header auth finished." }],
          toolCalls: [],
          suggestions: [],
          done: true,
          isWidgetHidden: false,
          actionsRemaining: 5,
        },
      })
    }

    const widget = await loadWidget(
      { auth: { mode: "header", source: "cookies", key: "legacy_cookie", authType: "bearer" } },
      { baseUrl: "https://customer.example", mockConfigFetch: false }
    )
    await openPanel(widget)
    const shadowRoot = getShadowRoot(widget)
    const input = shadowRoot.querySelector(".cta-widget-input") as HTMLTextAreaElement
    const send = shadowRoot.querySelector(".cta-widget-send") as HTMLButtonElement

    fireEvent.change(input, { target: { value: "Use legacy cookie header auth" } })
    fireEvent.click(send)

    await waitFor(() => {
      expect(shadowRoot.textContent).toContain("Legacy cookie header auth finished.")
    })
  })

  it("reuses one requestId across the full widget turn and clears it after completion", async () => {
    ;(global.fetch as jest.Mock).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/widget/config/")) {
        return createJsonResponse(createConfig())
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    let requestId = ""
    MockWebSocket.handler = (socket, message) => {
      const request = message.request || {}
      if (request.message) {
        expect(typeof request.requestId).toBe("string")
        expect(request.requestId).toBeTruthy()
        requestId = String(request.requestId)
        expect(readWidgetState().activeRequestId).toBe(requestId)
        socket.receive({
          type: "chat.response",
          response: {
            conversationId: "conversation-request-id",
            requestId,
            messages: [],
            toolCalls: [{ id: "tc_1", type: "find_elements", name: "find_elements", findQuery: "save button" }],
            suggestions: [],
            done: false,
            isWidgetHidden: false,
            actionsRemaining: 5,
          },
        })
        return
      }

      expect(request.requestId).toBe(requestId)
      socket.receive({
        type: "chat.response",
        response: {
          conversationId: "conversation-request-id",
          requestId,
          messages: [{ role: "assistant", content: "Finished." }],
          toolCalls: [],
          suggestions: [],
          done: true,
          isWidgetHidden: false,
          actionsRemaining: 5,
        },
      })
    }

    const widget = await loadWidget()
    await openPanel(widget)
    const shadowRoot = getShadowRoot(widget)
    const input = shadowRoot.querySelector(".cta-widget-input") as HTMLTextAreaElement
    const send = shadowRoot.querySelector(".cta-widget-send") as HTMLButtonElement

    fireEvent.change(input, { target: { value: "Check request id flow" } })
    fireEvent.click(send)

    await waitFor(() => {
      expect(MockWebSocket.instances[0]?.sent).toHaveLength(2)
      expect(shadowRoot.textContent).toContain("Finished.")
    })
    expect(readWidgetState().activeRequestId).toBeNull()
  })

  it("auto-resumes with the saved activeRequestId after navigation interruption", async () => {
    jest.useFakeTimers()
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: [],
        conversationId: "conversation-resume",
        activeQuery: "Resume this request",
        activeRequestId: "req_resume_saved",
        interruptedByNavigation: true,
        voice: {},
        auth: {},
        ui: {},
        suggestions: [],
      }))

      ;(global.fetch as jest.Mock).mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes("/widget/config/")) {
          return createJsonResponse(createConfig())
        }
        throw new Error(`Unexpected fetch: ${url}`)
      })

      MockWebSocket.handler = (socket, message) => {
        const request = message.request || {}
        expect(request.requestId).toBe("req_resume_saved")
        expect(request.conversationId).toBe("conversation-resume")
        expect(request.message).toBe("Resume this request")
        socket.receive({
          type: "chat.response",
          response: {
            conversationId: "conversation-resume",
            requestId: "req_resume_saved",
            messages: [{ role: "assistant", content: "Resumed." }],
            toolCalls: [],
            suggestions: [],
            done: true,
            isWidgetHidden: false,
            actionsRemaining: 5,
          },
        })
      }

      const widget = await loadWidget()
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500)
      })

      const shadowRoot = getShadowRoot(widget)
      await waitFor(() => {
        expect(MockWebSocket.instances[0]?.sent).toHaveLength(1)
        expect(shadowRoot.textContent).toContain("Resumed.")
      })
      expect(readWidgetState().activeRequestId).toBeNull()
      expect(readWidgetState().interruptedByNavigation).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it("keeps the panel closed when a pending request resumes after the user closes it", async () => {
    jest.useFakeTimers()
    try {
      ;(global.fetch as jest.Mock).mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes("/widget/config/")) {
          return createJsonResponse(createConfig())
        }
        throw new Error(`Unexpected fetch: ${url}`)
      })

      let requestId = ""
      let sendCount = 0
      MockWebSocket.handler = (socket, message) => {
        const request = message.request || {}
        if (!request.message) return

        sendCount += 1
        if (sendCount === 1) return

        expect(request.requestId).toBe(requestId)
        socket.receive({
          type: "chat.response",
          response: {
            conversationId: "conversation-resume-closed",
            requestId,
            messages: [{ role: "assistant", content: "Resumed while closed." }],
            toolCalls: [],
            suggestions: [],
            done: true,
            isWidgetHidden: false,
            actionsRemaining: 5,
          },
        })
      }

      const widget = await loadWidget()
      await openPanel(widget)
      const shadowRoot = getShadowRoot(widget)
      const input = shadowRoot.querySelector(".cta-widget-input") as HTMLTextAreaElement
      const send = shadowRoot.querySelector(".cta-widget-send") as HTMLButtonElement

      fireEvent.change(input, { target: { value: "Resume while keeping the widget closed" } })
      fireEvent.click(send)

      await waitFor(() => {
        requestId = readWidgetState().activeRequestId || ""
        expect(requestId).toBeTruthy()
      })

      fireEvent.click(widget.close)
      await waitFor(() => {
        expect(widget.panel.classList.contains("open")).toBe(false)
      })

      window.dispatchEvent(new Event("pagehide"))

      expect(readWidgetState()).toMatchObject({
        activeRequestId: requestId,
        interruptedByNavigation: true,
        resumePanelOpen: false,
      })

      document.body.innerHTML = ""

      const reloaded = await loadWidget()
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500)
      })

      const reloadedShadowRoot = getShadowRoot(reloaded)
      await waitFor(() => {
        expect(reloaded.toggle.getAttribute("aria-expanded")).toBe("false")
        expect(reloaded.toggle.classList.contains("has-unread")).toBe(true)
        expect(reloadedShadowRoot.textContent).toContain("Resumed while closed.")
      })

      expect(reloaded.panel.classList.contains("open")).toBe(false)
      expect(readWidgetState().activeRequestId).toBeNull()
      expect(readWidgetState().interruptedByNavigation).toBe(false)

      const scrollHarness = attachScrollHarness(getMessagesScroller(reloaded))
      scrollHarness.setMetrics({ clientHeight: 180, scrollHeight: 760, scrollTop: 0 })

      await openPanel(reloaded)

      expect(scrollIntoViewCalls.some((entry) => entry.includes("cta-widget-unread-divider"))).toBe(true)
      expect((reloadedShadowRoot.querySelector(".cta-widget-unread-divider-label") as HTMLSpanElement).textContent).toBe("New")
    } finally {
      jest.useRealTimers()
    }
  })

  it("auto-resumes with the saved activeRequestId even when conversationId is still null", async () => {
    jest.useFakeTimers()
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: [],
        conversationId: null,
        activeQuery: "Resume without conversation",
        activeRequestId: "req_resume_without_conversation",
        interruptedByNavigation: true,
        voice: {},
        auth: {},
        ui: {},
        suggestions: [],
      }))

      ;(global.fetch as jest.Mock).mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes("/widget/config/")) {
          return createJsonResponse(createConfig())
        }
        throw new Error(`Unexpected fetch: ${url}`)
      })

      MockWebSocket.handler = (socket, message) => {
        const request = message.request || {}
        expect(request.requestId).toBe("req_resume_without_conversation")
        expect(request.conversationId).toBeNull()
        expect(request.message).toBe("Resume without conversation")
        socket.receive({
          type: "chat.response",
          response: {
            conversationId: "conversation-resume-new",
            requestId: "req_resume_without_conversation",
            messages: [{ role: "assistant", content: "Resumed without conversation." }],
            toolCalls: [],
            suggestions: [],
            done: true,
            isWidgetHidden: false,
            actionsRemaining: 5,
          },
        })
      }

      const widget = await loadWidget()
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500)
      })

      const shadowRoot = getShadowRoot(widget)
      await waitFor(() => {
        expect(MockWebSocket.instances[0]?.sent).toHaveLength(1)
        expect(shadowRoot.textContent).toContain("Resumed without conversation.")
      })
      expect(readWidgetState().conversationId).toBe("conversation-resume-new")
      expect(readWidgetState().activeRequestId).toBeNull()
      expect(readWidgetState().interruptedByNavigation).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it("ignores stale chat responses that carry a different requestId", async () => {
    ;(global.fetch as jest.Mock).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/widget/config/")) {
        return createJsonResponse(createConfig())
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    MockWebSocket.handler = (socket, message) => {
      const request = message.request || {}
      const requestId = String(request.requestId)
      socket.receive({
        type: "chat.response",
        response: {
          conversationId: "conversation-stale",
          requestId: "req_stale_other",
          messages: [{ role: "assistant", content: "Stale response" }],
          toolCalls: [],
          suggestions: [],
          done: true,
          isWidgetHidden: false,
          actionsRemaining: 5,
        },
      })
      socket.receive({
        type: "chat.response",
        response: {
          conversationId: "conversation-stale",
          requestId,
          messages: [{ role: "assistant", content: "Fresh response" }],
          toolCalls: [],
          suggestions: [],
          done: true,
          isWidgetHidden: false,
          actionsRemaining: 5,
        },
      })
    }

    const widget = await loadWidget()
    await openPanel(widget)
    const shadowRoot = getShadowRoot(widget)
    const input = shadowRoot.querySelector(".cta-widget-input") as HTMLTextAreaElement
    const send = shadowRoot.querySelector(".cta-widget-send") as HTMLButtonElement

    fireEvent.change(input, { target: { value: "Ignore stale response" } })
    fireEvent.click(send)

    await waitFor(() => {
      expect(shadowRoot.textContent).toContain("Fresh response")
    })
    expect(shadowRoot.textContent).not.toContain("Stale response")
  })

  it("clears the activeRequestId when starting a new chat", async () => {
    ;(global.fetch as jest.Mock).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/widget/config/")) {
        return createJsonResponse(createConfig())
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    MockWebSocket.handler = () => {
    }

    const widget = await loadWidget()
    await openPanel(widget)
    const shadowRoot = getShadowRoot(widget)
    const input = shadowRoot.querySelector(".cta-widget-input") as HTMLTextAreaElement
    const send = shadowRoot.querySelector(".cta-widget-send") as HTMLButtonElement
    const newChat = shadowRoot.querySelector(".cta-widget-new-chat") as HTMLButtonElement

    fireEvent.change(input, { target: { value: "Leave request pending" } })
    fireEvent.click(send)

    await waitFor(() => {
      expect(readWidgetState().activeRequestId).toBeTruthy()
    })

    fireEvent.click(newChat)

    await waitFor(() => {
      expect(readWidgetState().activeRequestId).toBeNull()
      expect(readWidgetState().activeQuery).toBeNull()
    })
  })

  it("treats screen-share timeout like skip for the rest of the active run", async () => {
    jest.useFakeTimers()
    try {
      ;(global.fetch as jest.Mock).mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes("/widget/config/")) {
          return createJsonResponse(createConfig())
        }
        throw new Error(`Unexpected fetch: ${url}`)
      })

      let toolRound = 0
      MockWebSocket.handler = (socket, message) => {
        const request = message.request || {}
        if (request.message) {
          socket.receive({
            type: "chat.response",
            response: {
              conversationId: "conversation-4",
              messages: [],
              toolCalls: [{ id: "tc_1", type: "read_page", name: "read_page", readPageOptions: { filter: "interactive" } }],
              suggestions: [],
              done: false,
              isWidgetHidden: false,
              actionsRemaining: 5,
            },
          })
          return
        }

        toolRound += 1
        expect(request).toMatchObject({
          agentId: AGENT_ID,
          conversationId: "conversation-4",
          toolResults: [{ id: toolRound === 1 ? "tc_1" : "tc_2", statusCode: 200, body: expect.any(Object) }],
        })

        if (toolRound === 1) {
          socket.receive({
            type: "chat.response",
            response: {
              conversationId: "conversation-4",
              messages: [],
              toolCalls: [{ id: "tc_2", type: "read_page", name: "read_page", readPageOptions: { filter: "interactive" } }],
              suggestions: [],
              done: false,
              isWidgetHidden: false,
              actionsRemaining: 5,
            },
          })
          return
        }

        socket.receive({
          type: "chat.response",
          response: {
            conversationId: "conversation-4",
            messages: [{ role: "assistant", content: "Finished without screenshots." }],
            toolCalls: [],
            suggestions: [],
            done: true,
            isWidgetHidden: false,
            actionsRemaining: 5,
          },
        })
      }

      const widget = await loadWidget()
      await openPanel(widget)
      const shadowRoot = getShadowRoot(widget)
      const input = shadowRoot.querySelector(".cta-widget-input") as HTMLTextAreaElement
      const send = shadowRoot.querySelector(".cta-widget-send") as HTMLButtonElement

      fireEvent.change(input, { target: { value: "Check the page twice" } })
      fireEvent.click(send)

      await act(async () => {
        await jest.advanceTimersByTimeAsync(0)
      })

      expect(shadowRoot.textContent).toContain("Share this tab for a clearer view")
      expect(MockWebSocket.instances).toHaveLength(1)
      expect(MockWebSocket.instances[0]?.sent).toHaveLength(1)

      await act(async () => {
        await jest.advanceTimersByTimeAsync(20000)
      })

      expect(MockWebSocket.instances[0]?.sent).toHaveLength(3)
      expect(shadowRoot.textContent).toContain("Finished without screenshots.")
      expect(shadowRoot.textContent).not.toContain("Share this tab for a clearer view")
    } finally {
      jest.useRealTimers()
    }
  })
})
