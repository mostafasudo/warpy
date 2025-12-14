(function () {
  "use strict";

  const STORAGE_KEY = "cta_widget_state";
  const API_TIMEOUT = 30000;
  const API_URL = "http://localhost:8000";
  const MARKED_SRC = "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js";
  const MARKED_INTEGRITY = "sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi";
  const DOMPURIFY_SRC = "https://cdn.jsdelivr.net/npm/dompurify@3.1.2/dist/purify.min.js";
  const DOMPURIFY_INTEGRITY = "sha384-Y2u+tbsy03z8jtFrNMeiCU+7VdECSbkt7TIkTU95qOc01ZuCLYXbHnfuJa6WHLHw";

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

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
      const value = extractHeaderValue(config.source, config.key);
      if (value) {
        const isAuth = headerName.toLowerCase() === "authorization";
        if (isAuth) {
          const type = config.authType || "bearer";
          const trimmed = value.trim();
          const lower = trimmed.toLowerCase();
          if (type === "basic") {
            headers[headerName] = lower.startsWith("basic ") ? trimmed : "Basic " + trimmed;
          } else if (type === "none") {
            headers[headerName] = trimmed;
          } else {
            headers[headerName] = lower.startsWith("bearer ") ? trimmed : "Bearer " + trimmed;
          }
        } else {
          headers[headerName] = value;
        }
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

  function loadExternalScript(src, integrity) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-cta-src="${src}"]`) || document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.getAttribute("data-loaded") === "true") {
          resolve();
          return;
        }
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load " + src)), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      if (integrity) {
        script.integrity = integrity;
        script.crossOrigin = "anonymous";
      }
      script.async = true;
      script.setAttribute("data-cta-src", src);
      script.onload = () => {
        script.setAttribute("data-loaded", "true");
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(script);
    });
  }

  function createMarkdownRenderer(onReady) {
    let renderFn = null;
    let initPromise = null;

    function init() {
      if (initPromise) return initPromise;
      const markedLoader = window.marked ? Promise.resolve() : loadExternalScript(MARKED_SRC, MARKED_INTEGRITY);
      const purifyLoader = window.DOMPurify ? Promise.resolve() : loadExternalScript(DOMPURIFY_SRC, DOMPURIFY_INTEGRITY);
      initPromise = Promise.all([markedLoader, purifyLoader])
        .then(() => {
          const parse = typeof window.marked?.parse === "function" ? window.marked.parse : typeof window.marked === "function" ? window.marked : null;
          const purifier = window.DOMPurify && typeof window.DOMPurify.sanitize === "function" ? window.DOMPurify : null;
          if (parse && purifier) {
            return (value) => purifier.sanitize(parse(value || "", { gfm: true, breaks: true, headerIds: false, mangle: false }));
          }
          return null;
        })
        .catch(() => null);

      initPromise.then((fn) => {
        if (fn) {
          renderFn = fn;
          if (typeof onReady === "function") {
            onReady();
          }
        }
      });

      return initPromise;
    }

    init();

    return function renderMarkdown(value) {
      if (renderFn) {
        return renderFn(value);
      }
      const safe = escapeHtml(value || "");
      return safe.replace(/\n/g, "<br>");
    };
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
        color-scheme: light;
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
      .cta-widget-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cta-widget-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        scrollbar-width: thin;
        scrollbar-color: #d1d5db #f9fafb;
      }
      .cta-widget-messages::-webkit-scrollbar {
        width: 8px;
      }
      .cta-widget-messages::-webkit-scrollbar-track {
        background: #f9fafb;
      }
      .cta-widget-messages::-webkit-scrollbar-thumb {
        background: #d1d5db;
        border-radius: 999px;
      }
      .cta-widget-messages::-webkit-scrollbar-thumb:hover {
        background: #c0c4cc;
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
      .cta-widget-message h1,
      .cta-widget-message h2,
      .cta-widget-message h3,
      .cta-widget-message h4,
      .cta-widget-message h5,
      .cta-widget-message h6 {
        margin: 0 0 8px;
        line-height: 1.3;
        font-weight: 700;
      }
      .cta-widget-message h1 { font-size: 18px; }
      .cta-widget-message h2 { font-size: 17px; }
      .cta-widget-message h3 { font-size: 16px; }
      .cta-widget-message h4,
      .cta-widget-message h5,
      .cta-widget-message h6 { font-size: 15px; }
      .cta-widget-message p,
      .cta-widget-message ul,
      .cta-widget-message ol,
      .cta-widget-message pre,
      .cta-widget-message table,
      .cta-widget-message blockquote {
        margin: 0 0 10px;
      }
      .cta-widget-message ul,
      .cta-widget-message ol {
        padding-left: 20px;
      }
      .cta-widget-message li {
        margin-bottom: 6px;
      }
      .cta-widget-message blockquote {
        padding-left: 12px;
        border-left: 3px solid #e5e7eb;
        color: #4b5563;
      }
      .cta-widget-message a {
        color: inherit;
        text-decoration: underline;
        word-break: break-all;
      }
      .cta-widget-message.assistant a {
        color: #1d4ed8;
      }
      .cta-widget-message code {
        background: rgba(17, 24, 39, 0.06);
        padding: 2px 6px;
        border-radius: 6px;
        font-size: 13px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
      .cta-widget-message.user code {
        background: rgba(255, 255, 255, 0.2);
      }
      .cta-widget-message pre {
        background: #0f172a;
        color: #e2e8f0;
        padding: 12px;
        border-radius: 12px;
        overflow-x: auto;
        max-width: 100%;
      }
      .cta-widget-message pre code {
        background: transparent;
        padding: 0;
        color: inherit;
      }
      .cta-widget-message table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        display: block;
        overflow-x: auto;
      }
      .cta-widget-message th,
      .cta-widget-message td {
        border: 1px solid #e5e7eb;
        padding: 8px 10px;
        text-align: left;
      }
      .cta-widget-message tr:nth-child(even) {
        background: #f9fafb;
      }
      .cta-widget-message > :last-child {
        margin-bottom: 0;
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
        background: #ffffff;
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
        background: #ffffff;
        color: #111827;
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
      .cta-voice-controls {
        display: flex;
        align-items: center;
        gap: 6px;
        position: relative;
      }
      .cta-mic-group {
        display: flex;
        align-items: center;
        gap: 0;
      }
      .cta-widget-mic {
        position: relative;
        width: 44px;
        height: 44px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, opacity 0.15s;
        flex-shrink: 0;
      }
      .cta-widget-mic svg {
        width: 18px;
        height: 18px;
        color: #374151;
      }
      .cta-widget-mic.paired {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
      }
      .cta-widget-mic-select {
        width: 36px;
        height: 44px;
        border: 1px solid #e5e7eb;
        border-left: none;
        border-radius: 0 12px 12px 0;
        margin-left: -1px;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, opacity 0.15s;
        flex-shrink: 0;
      }
      .cta-widget-mic-select svg {
        width: 14px;
        height: 14px;
        color: #374151;
      }
      .cta-widget-mic:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
      .cta-widget-mic-select:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
      .cta-widget-mic:hover:not(:disabled),
      .cta-widget-mic-select:hover:not(:disabled) {
        border-color: #3b82f6;
      }
      .cta-widget-mic.recording {
        background: #fee2e2;
        border-color: #ef4444;
        box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.12);
        animation: cta-pulse 1.2s ease-in-out infinite;
      }
      .cta-widget-mic.recording svg {
        color: #b91c1c;
      }
      .cta-mic-dot {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ef4444;
        box-shadow: 0 0 0 2px #fff;
        opacity: 0;
        transition: opacity 0.15s;
      }
      .cta-widget-mic.recording .cta-mic-dot {
        opacity: 1;
      }
      .cta-widget-mic-menu {
        position: absolute;
        bottom: 44px;
        right: 0;
        min-width: 200px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
        display: none;
        overflow: hidden;
        z-index: 2;
      }
      .cta-widget-mic-menu.open {
        display: block;
      }
      .cta-widget-mic-menu button {
        width: 100%;
        padding: 10px 12px;
        text-align: left;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 13px;
        color: #111827;
      }
      .cta-widget-mic-menu button:hover {
        background: #f3f4f6;
      }
      .cta-widget-mic-menu button.active {
        background: #eff6ff;
        color: #1d4ed8;
      }
      .cta-voice-hint,
      .cta-voice-error {
        margin-top: 8px;
        padding: 6px 10px;
        font-size: 12px;
        line-height: 1.4;
        text-align: center;
        border-radius: 8px;
        display: none;
        justify-content: center;
      }
      .cta-voice-hint {
        color: #4b5563;
        background: #f9fafb;
      }
      .cta-voice-error {
        color: #b91c1c;
        background: #fef2f2;
      }
      @keyframes cta-pulse {
        0% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.12); }
        50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0.08); }
        100% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.12); }
      }
      .cta-widget-new-chat {
        padding: 8px 10px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        cursor: pointer;
        font-size: 12px;
        color: #374151;
        transition: border-color 0.15s, color 0.15s, background 0.15s;
      }
      .cta-widget-new-chat:hover {
        border-color: #3b82f6;
        color: #1d4ed8;
        background: #eff6ff;
      }
    `;
    return style;
  }

  function createWidget(config) {
    const apiUrl = API_URL;
    const state = loadState() || { messages: [], conversationId: null, voice: {}, auth: {} };
    if (!state.voice) state.voice = {};
    if (!state.auth) state.auth = {};
    let headerConfig = {};
    let widgetAuthToken = state.auth.token || null;
    let widgetRefreshEndpointPath = "/widget-token";
    let configPromise = null;
    let isLoading = false;
    let isOpen = false;
    let isRecording = false;
    let isTranscribing = false;
    let mediaRecorder = null;
    let mediaStream = null;
    let recordedChunks = [];
    let micDevices = [];
    let micMenuOpen = false;
    let micPermissionDenied = false;
    let selectedMicId = state.voice.deviceId || null;
    let recordingTimeout = null;
    let micAccessRequested = false;

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
        <div class="cta-widget-header-actions">
          <button class="cta-widget-new-chat">New chat</button>
          <button class="cta-widget-close" aria-label="Close chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="cta-widget-messages"></div>
      <div class="cta-widget-input-area">
        <div class="cta-widget-input-row">
          <input type="text" class="cta-widget-input" placeholder="Type a command..." />
          <div class="cta-voice-controls">
            <div class="cta-mic-group">
              <button class="cta-widget-mic" aria-label="Start voice input" title="Start voice input">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/>
                  <path d="M19 11a7 7 0 0 1-14 0"/>
                  <path d="M12 18v3"/>
                  <path d="M8 21h8"/>
                </svg>
                <span class="cta-mic-dot"></span>
              </button>
      <button class="cta-widget-mic-select" aria-label="Select microphone" title="Select microphone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 15l6-6 6 6"/>
        </svg>
      </button>
            </div>
            <div class="cta-widget-mic-menu"></div>
          </div>
          <button class="cta-widget-send" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
        <div class="cta-voice-hint" aria-live="polite"></div>
        <div class="cta-voice-error" aria-live="assertive"></div>
      </div>
    `;

    container.appendChild(toggle);
    container.appendChild(panel);

    const messagesEl = panel.querySelector(".cta-widget-messages");
    const inputEl = panel.querySelector(".cta-widget-input");
    const sendEl = panel.querySelector(".cta-widget-send");
    const closeEl = panel.querySelector(".cta-widget-close");
    const newChatEl = panel.querySelector(".cta-widget-new-chat");
    const micEl = panel.querySelector(".cta-widget-mic");
    const micSelectEl = panel.querySelector(".cta-widget-mic-select");
    const micMenuEl = panel.querySelector(".cta-widget-mic-menu");
    const voiceHintEl = panel.querySelector(".cta-voice-hint");
    const voiceErrorEl = panel.querySelector(".cta-voice-error");
    const renderMarkdown = createMarkdownRenderer(() => renderMessages());

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

      messagesEl.innerHTML = "";

      state.messages.forEach((msg) => {
        const bubble = document.createElement("div");
        bubble.className = `cta-widget-message ${msg.role}`;
        if (msg.role === "assistant") {
          bubble.innerHTML = renderMarkdown(msg.content);
        } else {
          bubble.textContent = msg.content;
        }
        messagesEl.appendChild(bubble);
      });

      if (isLoading) {
        const loading = document.createElement("div");
        loading.className = "cta-widget-loading";
        loading.innerHTML = "<span></span><span></span><span></span>";
        messagesEl.appendChild(loading);
      }

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setLoading(loading) {
      isLoading = loading;
      sendEl.disabled = loading;
      updateMicState();
      renderMessages();
    }

    function persistVoiceState() {
      state.voice = {
        deviceId: selectedMicId
      };
      saveState(state);
    }

    function setVoiceHint(message) {
      voiceHintEl.textContent = message || "";
      voiceHintEl.style.display = message ? "flex" : "none";
    }

    function setVoiceError(message) {
      voiceErrorEl.textContent = message || "";
      voiceErrorEl.style.display = message ? "flex" : "none";
    }

    function updateMicState() {
      const hasMic = micDevices.length > 0;
      micEl.classList.toggle("recording", isRecording);
      micEl.disabled = !hasMic || micPermissionDenied || isTranscribing;
      micEl.setAttribute("aria-pressed", isRecording ? "true" : "false");
      micEl.title = micPermissionDenied
        ? "Microphone access blocked"
        : hasMic
          ? isRecording
            ? "Stop and insert transcription"
            : "Start voice input"
          : "No microphone detected";
      const showSelector = micDevices.length > 1 && !micPermissionDenied;
      micSelectEl.style.display = showSelector ? "flex" : "none";
      micSelectEl.disabled = !showSelector || micPermissionDenied || isTranscribing;
      micSelectEl.title = micPermissionDenied
        ? "Microphone access blocked"
        : showSelector
          ? "Select microphone"
          : "No alternate microphone";
      micEl.classList.toggle("paired", showSelector);
      if (!hasMic && !micPermissionDenied) {
        setVoiceError("No microphone detected");
      } else if (!isRecording && !isTranscribing && !micPermissionDenied && micDevices.length) {
        setVoiceError("");
      }
      if (isRecording) {
        setVoiceHint("Listening… press Enter or tap the mic to finish.");
      } else if (isTranscribing) {
        setVoiceHint("Transcribing…");
      } else {
        setVoiceHint("");
      }
    }

    function closeMicMenu() {
      micMenuOpen = false;
      micMenuEl.classList.remove("open");
      document.removeEventListener("click", handleOutsideMenuClick);
    }

    function openMicMenu() {
      if (micPermissionDenied || micDevices.length < 2 || micMenuOpen) return;
      micMenuOpen = true;
      micMenuEl.classList.add("open");
      document.addEventListener("click", handleOutsideMenuClick);
    }

    function handleOutsideMenuClick(event) {
      if (!micMenuOpen) return;
      if (micMenuEl.contains(event.target) || micSelectEl.contains(event.target) || micEl.contains(event.target)) return;
      closeMicMenu();
    }

    function renderMicMenu() {
      if (micDevices.length < 2 || micPermissionDenied) {
        micMenuEl.innerHTML = "";
        closeMicMenu();
        return;
      }
      micMenuEl.innerHTML = micDevices
        .map((device, index) => {
          const label = device.label || `Microphone ${index + 1}`;
          const active = device.deviceId === selectedMicId ? "active" : "";
          return `<button type="button" data-device-id="${escapeHtml(device.deviceId)}" class="${active}">${escapeHtml(label)}</button>`;
        })
        .join("");
    }

    async function refreshDevices(requestAccess = false) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        micDevices = [];
        micPermissionDenied = true;
        updateMicState();
        return;
      }
      if (requestAccess) {
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
          probe.getTracks().forEach((track) => track.stop());
          micPermissionDenied = false;
        } catch (error) {
          micPermissionDenied = error && error.name === "NotAllowedError";
          setVoiceError(micPermissionDenied ? "Microphone access blocked. Enable it in your browser settings to use voice input." : "Microphone unavailable");
        }
      }
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        micDevices = all.filter((d) => d.kind === "audioinput");
        if (!micDevices.find((d) => d.deviceId === selectedMicId)) {
          selectedMicId = micDevices[0] ? micDevices[0].deviceId : null;
        }
        persistVoiceState();
        renderMicMenu();
        updateMicState();
      } catch {
        micDevices = [];
        updateMicState();
      }
    }

    function cleanupStream() {
      if (recordingTimeout) {
        clearTimeout(recordingTimeout);
        recordingTimeout = null;
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
      mediaRecorder = null;
    }

    function stopRecording() {
      if (!isRecording) return;
      isRecording = false;
      updateMicState();
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      } else {
        handleRecordingStop();
      }
    }

    async function handleRecordingStop() {
      cleanupStream();
      const blob = recordedChunks.length ? new Blob(recordedChunks, { type: recordedChunks[0].type || "audio/webm" }) : null;
      recordedChunks = [];
      if (!blob || blob.size === 0) {
        setVoiceError("We couldn't transcribe your speech. Please try again or type your message.");
        updateMicState();
        return;
      }
      await transcribeRecording(blob);
    }

    async function transcribeRecording(blob) {
      if (isTranscribing) return;
      isTranscribing = true;
      updateMicState();
      setVoiceError("");
      const query = new URLSearchParams({ agentId: config.agentId });
      if (selectedMicId) {
        query.set("deviceId", selectedMicId);
      }
      await ensureConfigLoaded();
      const makeRequest = () =>
        fetchWithTimeout(`${apiUrl}/widget/transcribe?${query.toString()}`, {
          method: "POST",
          body: blob,
          headers: {
            "Content-Type": blob.type || "audio/webm",
            "x-audio-filename": "audio.webm",
            ...(widgetAuthToken ? { Authorization: `Bearer ${widgetAuthToken}` } : {}),
          }
        });

      let attempt = 0;
      while (attempt < 2) {
        attempt += 1;
        try {
          let response = await makeRequest();
          if (response.status === 401) {
            const errorBody = await response.json().catch(() => null);
            const code = errorBody && errorBody.detail && errorBody.detail.code;
            if (code === "WIDGET_AUTH_REQUIRED" || code === "WIDGET_AUTH_INVALID") {
              await refreshWidgetToken();
              continue;
            }
          }
          if (!response.ok) {
            throw new Error("Transcription failed");
          }
          const data = await response.json();
          const text = data && data.text ? String(data.text) : "";
          if (!text.trim()) {
            throw new Error("Empty transcription");
          }
          insertTranscription(text);
          isTranscribing = false;
          updateMicState();
          return;
        } catch (error) {
          if (attempt >= 2) {
            setVoiceError("We couldn't transcribe your speech. Please try again or type your message.");
          }
        }
      }
      isTranscribing = false;
      updateMicState();
    }

    async function startRecording() {
      if (isRecording || isTranscribing) return;
      setVoiceError("");
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setVoiceError("Microphone unavailable");
        micPermissionDenied = true;
        updateMicState();
        return;
      }
      try {
        const constraints = selectedMicId ? { audio: { deviceId: { exact: selectedMicId } } } : { audio: true };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        micPermissionDenied = false;
        await refreshDevices(false);
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(mediaStream);
        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
          }
        };
        mediaRecorder.onstop = handleRecordingStop;
        mediaRecorder.start();
        isRecording = true;
        updateMicState();
        recordingTimeout = setTimeout(() => stopRecording(), 45000);
      } catch (error) {
        micPermissionDenied = error && error.name === "NotAllowedError";
        setVoiceError(micPermissionDenied ? "Microphone access blocked. Enable it in your browser settings to use voice input." : "Microphone unavailable");
        updateMicState();
      }
    }

    function insertTranscription(text) {
      const trimmed = text.trim();
      if (!trimmed) return;
      const current = inputEl.value;
      const needsSpace = current && !current.endsWith(" ");
      inputEl.value = needsSpace ? `${current} ${trimmed}` : `${current}${trimmed}`;
      inputEl.focus();
      inputEl.selectionStart = inputEl.value.length;
      inputEl.selectionEnd = inputEl.value.length;
    }

    async function fetchConfig() {
      try {
        const res = await fetchWithTimeout(`${apiUrl}/widget/config/${config.agentId}`);
        if (res.ok) {
          const data = await res.json();
          headerConfig = data.headers || {};
          widgetRefreshEndpointPath = data.widgetRefreshEndpointPath || "/widget-token";
        }
      } catch {}
    }

    function ensureConfigLoaded() {
      if (!configPromise) {
        configPromise = fetchConfig();
      }
      return configPromise;
    }

    async function refreshWidgetToken() {
      if (!config.baseUrl) {
        throw new Error("Missing baseUrl");
      }
      const url = new URL(widgetRefreshEndpointPath, config.baseUrl.endsWith("/") ? config.baseUrl : config.baseUrl + "/");
      const sessionHeaders = buildHeaders(headerConfig);
      const res = await fetchWithTimeout(url.toString(), { method: "POST", headers: sessionHeaders });
      if (!res.ok) {
        throw new Error("Token refresh failed");
      }
      const data = await res.json().catch(() => null);
      const token = data && data.token;
      if (!token || typeof token !== "string") {
        throw new Error("Token refresh failed");
      }
      widgetAuthToken = token;
      state.auth.token = token;
      saveState(state);
    }

    async function postWidgetChat(body) {
      await ensureConfigLoaded();
      const makeRequest = () =>
        fetchWithTimeout(`${apiUrl}/widget/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(widgetAuthToken ? { Authorization: `Bearer ${widgetAuthToken}` } : {}),
          },
          body: JSON.stringify(body),
        });

      let response = await makeRequest();
      if (response.status === 401) {
        const errorBody = await response.json().catch(() => null);
        const code = errorBody && errorBody.detail && errorBody.detail.code;
        if (code === "WIDGET_AUTH_REQUIRED" || code === "WIDGET_AUTH_INVALID") {
          await refreshWidgetToken();
          response = await makeRequest();
        }
      }
      return response;
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

        let response = await postWidgetChat(payload);

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

            response = await postWidgetChat({
              agentId: config.agentId,
              conversationId: state.conversationId,
              toolResults,
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
      } else {
        closeMicMenu();
        stopRecording();
      }
    }

    function startNewChat() {
      state.messages = [];
      state.conversationId = null;
      saveState(state);
      renderMessages();
    }

    toggle.addEventListener("click", togglePanel);
    closeEl.addEventListener("click", togglePanel);
    newChatEl.addEventListener("click", startNewChat);
    micEl.addEventListener("click", (event) => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
    micSelectEl.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (micSelectEl.disabled) return;
      if (micMenuOpen) {
        closeMicMenu();
        return;
      }
      if (!micAccessRequested) {
        micAccessRequested = true;
        await refreshDevices(true);
      } else {
        await refreshDevices(false);
      }
      renderMicMenu();
      openMicMenu();
    });
    micMenuEl.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-device-id]");
      if (!button) return;
      selectedMicId = button.getAttribute("data-device-id");
      persistVoiceState();
      renderMicMenu();
      closeMicMenu();
    });

    sendEl.addEventListener("click", () => {
      sendMessage(inputEl.value);
      inputEl.value = "";
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isRecording) {
          stopRecording();
          return;
        }
        if (isLoading) return;
        sendMessage(inputEl.value);
        inputEl.value = "";
      }
    });

    ensureConfigLoaded();
    refreshDevices(false);
    updateMicState();
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
