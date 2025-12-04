(function () {
  "use strict";

  const STORAGE_KEY = "cta_widget_state";
  const API_TIMEOUT = 30000;
  const API_URL = "http://localhost:8000";

  function getScriptData() {
    const scripts = document.querySelectorAll("script[data-agent-id]");
    const script = scripts[scripts.length - 1];
    if (!script) return null;
    return {
      agentId: script.getAttribute("data-agent-id"),
      baseUrl: script.getAttribute("data-base-url"),
    };
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveState(state) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function clearState() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  async function fetchWithTimeout(url, options = {}, timeout = API_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function extractHeaderValue(source, key) {
    if (source === "localStorage") {
      return localStorage.getItem(key);
    }
    if (source === "sessionStorage") {
      return sessionStorage.getItem(key);
    }
    if (source === "cookies") {
      const match = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    }
    return null;
  }

  function buildHeaders(headerConfig) {
    const headers = {};
    for (const [headerName, config] of Object.entries(headerConfig)) {
      let value = extractHeaderValue(config.source, config.key);
      if (value) {
        if (headerName.toLowerCase() === "authorization" && !value.startsWith("Bearer ")) {
          value = "Bearer " + value;
        }
        headers[headerName] = value;
      }
    }
    return headers;
  }

  function substitutePath(path, params) {
    let result = path;
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), encodeURIComponent(String(value)));
    }
    return result;
  }

  async function executeToolCall(toolCall, baseUrl, headerConfig) {
    const sessionHeaders = buildHeaders(headerConfig);
    const path = substitutePath(toolCall.path, toolCall.params || {});
    const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");

    if (toolCall.query) {
      for (const [key, value] of Object.entries(toolCall.query)) {
        url.searchParams.set(key, String(value));
      }
    }

    const requestHeaders = {
      "Content-Type": "application/json",
      ...sessionHeaders,
      ...(toolCall.headers || {}),
    };

    const fetchOptions = {
      method: toolCall.method,
      headers: requestHeaders,
    };

    if (toolCall.body && Object.keys(toolCall.body).length > 0) {
      fetchOptions.body = JSON.stringify(toolCall.body);
    }

    try {
      const response = await fetchWithTimeout(url.toString(), fetchOptions);
      let body;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        body = await response.json();
      } else {
        body = await response.text();
      }
      return { id: toolCall.id, statusCode: response.status, body };
    } catch (error) {
      return { id: toolCall.id, statusCode: 0, body: null, error: error.message || "Request failed" };
    }
  }

  function createStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .cta-widget-toggle {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        z-index: 99999;
      }
      .cta-widget-toggle:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 24px rgba(59, 130, 246, 0.5);
      }
      .cta-widget-toggle svg {
        width: 28px;
        height: 28px;
        color: white;
      }
      .cta-widget-toggle .cta-dot {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 10px;
        height: 10px;
        background: #ef4444;
        border-radius: 50%;
        border: 2px solid white;
      }
      .cta-widget-panel {
        position: fixed;
        bottom: 96px;
        right: 24px;
        width: 400px;
        max-width: calc(100vw - 48px);
        height: 560px;
        max-height: calc(100vh - 120px);
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 99998;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .cta-widget-panel.open {
        display: flex;
      }
      .cta-widget-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
        background: #fafafa;
      }
      .cta-widget-header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .cta-widget-avatar {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .cta-widget-avatar svg {
        width: 20px;
        height: 20px;
        color: #3b82f6;
      }
      .cta-widget-avatar .cta-status {
        position: absolute;
        bottom: -2px;
        left: -2px;
        width: 12px;
        height: 12px;
        background: #22c55e;
        border-radius: 50%;
        border: 2px solid white;
      }
      .cta-widget-title {
        font-size: 15px;
        font-weight: 600;
        color: #111827;
        margin: 0;
      }
      .cta-widget-subtitle {
        font-size: 12px;
        color: #6b7280;
        margin: 0;
      }
      .cta-widget-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
        color: #6b7280;
        transition: background 0.15s;
      }
      .cta-widget-close:hover {
        background: #f3f4f6;
      }
      .cta-widget-close svg {
        width: 20px;
        height: 20px;
      }
      .cta-widget-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .cta-widget-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 40px 20px;
        color: #6b7280;
      }
      .cta-widget-empty-icon {
        width: 64px;
        height: 64px;
        background: #f3f4f6;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;
      }
      .cta-widget-empty-icon svg {
        width: 32px;
        height: 32px;
        color: #9ca3af;
      }
      .cta-widget-empty h3 {
        font-size: 16px;
        font-weight: 600;
        color: #374151;
        margin: 0 0 8px;
      }
      .cta-widget-empty p {
        font-size: 14px;
        margin: 0;
        max-width: 280px;
      }
      .cta-widget-message {
        max-width: 85%;
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        word-wrap: break-word;
      }
      .cta-widget-message.user {
        align-self: flex-end;
        background: #3b82f6;
        color: white;
        border-bottom-right-radius: 4px;
      }
      .cta-widget-message.assistant {
        align-self: flex-start;
        background: #f3f4f6;
        color: #111827;
        border-bottom-left-radius: 4px;
      }
      .cta-widget-loading {
        align-self: flex-start;
        display: flex;
        gap: 4px;
        padding: 16px;
      }
      .cta-widget-loading span {
        width: 8px;
        height: 8px;
        background: #9ca3af;
        border-radius: 50%;
        animation: cta-bounce 1.4s ease-in-out infinite;
      }
      .cta-widget-loading span:nth-child(1) { animation-delay: 0s; }
      .cta-widget-loading span:nth-child(2) { animation-delay: 0.2s; }
      .cta-widget-loading span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes cta-bounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
      }
      .cta-widget-input-area {
        padding: 16px 20px;
        border-top: 1px solid #e5e7eb;
        background: #fafafa;
      }
      .cta-widget-input-row {
        display: flex;
        gap: 8px;
        align-items: flex-end;
      }
      .cta-widget-input {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        font-size: 14px;
        resize: none;
        outline: none;
        font-family: inherit;
        transition: border-color 0.15s;
      }
      .cta-widget-input:focus {
        border-color: #3b82f6;
      }
      .cta-widget-input::placeholder {
        color: #9ca3af;
      }
      .cta-widget-send {
        width: 44px;
        height: 44px;
        background: #3b82f6;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        flex-shrink: 0;
      }
      .cta-widget-send:hover:not(:disabled) {
        background: #2563eb;
      }
      .cta-widget-send:disabled {
        background: #93c5fd;
        cursor: not-allowed;
      }
      .cta-widget-send svg {
        width: 20px;
        height: 20px;
        color: white;
      }
      .cta-widget-new-chat {
        margin-top: 8px;
        width: 100%;
        padding: 8px;
        background: none;
        border: 1px dashed #e5e7eb;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        color: #6b7280;
        transition: border-color 0.15s, color 0.15s;
      }
      .cta-widget-new-chat:hover {
        border-color: #3b82f6;
        color: #3b82f6;
      }
    `;
    return style;
  }

  function createWidget(config) {
    const apiUrl = API_URL;
    const state = loadState() || { messages: [], conversationId: null };
    let headerConfig = {};
    let isLoading = false;
    let isOpen = false;

    const container = document.createElement("div");
    container.id = "cta-widget-container";

    const toggle = document.createElement("button");
    toggle.className = "cta-widget-toggle";
    toggle.setAttribute("aria-label", "Open chat assistant");
    toggle.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"/>
        <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"/>
        <path d="M18 14l.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5z"/>
      </svg>
    `;

    const panel = document.createElement("div");
    panel.className = "cta-widget-panel";
    panel.innerHTML = `
      <div class="cta-widget-header">
        <div class="cta-widget-header-left">
          <div class="cta-widget-avatar" style="position:relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"/>
              <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"/>
            </svg>
            <span class="cta-status"></span>
          </div>
          <div>
            <p class="cta-widget-title">Dashboard Assistant</p>
            <p class="cta-widget-subtitle">Ready for your command</p>
          </div>
        </div>
        <button class="cta-widget-close" aria-label="Close chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="cta-widget-messages"></div>
      <div class="cta-widget-input-area">
        <div class="cta-widget-input-row">
          <input type="text" class="cta-widget-input" placeholder="Type a command..." />
          <button class="cta-widget-send" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
        <button class="cta-widget-new-chat">Start new conversation</button>
      </div>
    `;

    container.appendChild(toggle);
    container.appendChild(panel);

    const messagesEl = panel.querySelector(".cta-widget-messages");
    const inputEl = panel.querySelector(".cta-widget-input");
    const sendEl = panel.querySelector(".cta-widget-send");
    const closeEl = panel.querySelector(".cta-widget-close");
    const newChatEl = panel.querySelector(".cta-widget-new-chat");

    function renderMessages() {
      if (state.messages.length === 0) {
        messagesEl.innerHTML = `
          <div class="cta-widget-empty">
            <div class="cta-widget-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"/>
                <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"/>
              </svg>
            </div>
            <h3>How can I help you?</h3>
            <p>I can help you perform tasks and retrieve data across your dashboard. What would you like me to do?</p>
          </div>
        `;
        return;
      }

      messagesEl.innerHTML = state.messages
        .map(
          (msg) =>
            `<div class="cta-widget-message ${msg.role}">${escapeHtml(msg.content)}</div>`
        )
        .join("");

      if (isLoading) {
        messagesEl.innerHTML += `
          <div class="cta-widget-loading">
            <span></span><span></span><span></span>
          </div>
        `;
      }

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    function setLoading(loading) {
      isLoading = loading;
      sendEl.disabled = loading;
      inputEl.disabled = loading;
      renderMessages();
    }

    async function fetchConfig() {
      try {
        const res = await fetchWithTimeout(`${apiUrl}/widget/config/${config.agentId}`);
        if (res.ok) {
          const data = await res.json();
          headerConfig = data.headers || {};
        }
      } catch {}
    }

    async function sendMessage(text) {
      if (!text.trim() || isLoading) return;

      state.messages.push({ role: "user", content: text.trim() });
      saveState(state);
      renderMessages();
      setLoading(true);

      try {
        const payload = {
          agentId: config.agentId,
          conversationId: state.conversationId,
          message: text.trim(),
        };

        let response = await fetchWithTimeout(`${apiUrl}/widget/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Chat request failed");
        }

        let data = await response.json();
        state.conversationId = data.conversationId;
        saveState(state);

        const MAX_ITERATIONS = 25;
        let iterations = 0;
        while (!data.done) {
          if (++iterations > MAX_ITERATIONS) {
            throw new Error("Too many tool call iterations");
          }

          if (data.toolCalls && data.toolCalls.length > 0) {
            const toolResults = await Promise.all(
              data.toolCalls.map((tc) => executeToolCall(tc, config.baseUrl, headerConfig))
            );

            response = await fetchWithTimeout(`${apiUrl}/widget/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: config.agentId,
                conversationId: state.conversationId,
                toolResults,
              }),
            });

            if (!response.ok) {
              throw new Error("Tool result request failed");
            }

            data = await response.json();
          } else {
            break;
          }
        }

        if (data.messages && data.messages.length > 0) {
          for (const msg of data.messages) {
            state.messages.push({ role: msg.role, content: msg.content });
          }
        }

        saveState(state);
      } catch (error) {
        state.messages.push({
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        });
        saveState(state);
      }

      setLoading(false);
    }

    function togglePanel() {
      isOpen = !isOpen;
      panel.classList.toggle("open", isOpen);
      if (isOpen) {
        inputEl.focus();
        renderMessages();
      }
    }

    function startNewChat() {
      state.messages = [];
      state.conversationId = null;
      clearState();
      renderMessages();
    }

    toggle.addEventListener("click", togglePanel);
    closeEl.addEventListener("click", togglePanel);
    newChatEl.addEventListener("click", startNewChat);

    sendEl.addEventListener("click", () => {
      sendMessage(inputEl.value);
      inputEl.value = "";
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputEl.value);
        inputEl.value = "";
      }
    });

    fetchConfig();
    renderMessages();

    return container;
  }

  function init() {
    const config = getScriptData();
    if (!config || !config.agentId) {
      console.warn("[ChatToAPI] Missing data-agent-id attribute");
      return;
    }

    if (document.getElementById("cta-widget-container")) {
      return;
    }

    const style = createStyles();
    document.head.appendChild(style);

    const widget = createWidget(config);
    document.body.appendChild(widget);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

