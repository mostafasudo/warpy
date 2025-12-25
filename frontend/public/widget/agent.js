(function () {
  "use strict";

  const STORAGE_KEY = "cta_widget_state";
  const UI_STORAGE_KEY = "cta_widget_ui_state";
  const API_TIMEOUT = 30000;
  const API_URL = "http://localhost:8000";
  const MARKED_SRC = "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js";
  const MARKED_INTEGRITY = "sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi";
  const DOMPURIFY_SRC = "https://cdn.jsdelivr.net/npm/dompurify@3.1.2/dist/purify.min.js";
  const DOMPURIFY_INTEGRITY = "sha384-Y2u+tbsy03z8jtFrNMeiCU+7VdECSbkt7TIkTU95qOc01ZuCLYXbHnfuJa6WHLHw";
  const WIDGET_CONTAINER_ID = "cta-widget-container";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function parseColor(input) {
    if (!input || typeof input !== "string") return null;
    const value = input.trim().toLowerCase();
    if (!value) return null;
    if (value === "transparent") {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const rgbMatch = value.match(/^rgba?\((.*)\)$/);
    if (rgbMatch) {
      const parts = rgbMatch[1].trim().split(/[,/ ]+/).filter(Boolean);
      if (parts.length < 3) return null;
      const r = Number(parts[0]);
      const g = Number(parts[1]);
      const b = Number(parts[2]);
      const a = parts.length >= 4 ? Number(parts[3]) : 1;
      if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
      return { r: clamp(Math.round(r), 0, 255), g: clamp(Math.round(g), 0, 255), b: clamp(Math.round(b), 0, 255), a: clamp(a, 0, 1) };
    }
    const hexMatch = value.match(/^#([0-9a-f]{3,8})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      const expand = (s) => s.split("").map((c) => c + c).join("");
      const normalized = hex.length === 3 || hex.length === 4 ? expand(hex) : hex;
      if (normalized.length !== 6 && normalized.length !== 8) return null;
      const r = parseInt(normalized.slice(0, 2), 16);
      const g = parseInt(normalized.slice(2, 4), 16);
      const b = parseInt(normalized.slice(4, 6), 16);
      const a = normalized.length === 8 ? parseInt(normalized.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }

  function rgbCss({ r, g, b }) {
    return `rgb(${r}, ${g}, ${b})`;
  }

  function rgbaCss({ r, g, b }, alpha) {
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
  }

  function mixRgb(a, b, t) {
    const ratio = clamp(t, 0, 1);
    return {
      r: Math.round(a.r + (b.r - a.r) * ratio),
      g: Math.round(a.g + (b.g - a.g) * ratio),
      b: Math.round(a.b + (b.b - a.b) * ratio),
      a: 1,
    };
  }

  function relativeLuminance({ r, g, b }) {
    const normalize = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const R = normalize(r);
    const G = normalize(g);
    const B = normalize(b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  }

  function inferThemeFromPage() {
    const body = document.body || document.documentElement;
    const bodyStyles = body ? getComputedStyle(body) : null;
    const htmlStyles = getComputedStyle(document.documentElement);
    const fgValue = bodyStyles ? bodyStyles.color : htmlStyles.color;
    const fontFamily = bodyStyles ? bodyStyles.fontFamily : htmlStyles.fontFamily;
    const fontSize = bodyStyles ? bodyStyles.fontSize : htmlStyles.fontSize;
    const fg = parseColor(fgValue) || { r: 17, g: 24, b: 39, a: 1 };

    const bodyBg = bodyStyles ? parseColor(bodyStyles.backgroundColor) : null;
    const htmlBg = parseColor(htmlStyles.backgroundColor);
    let bg = bodyBg && bodyBg.a > 0.05 ? bodyBg : htmlBg && htmlBg.a > 0.05 ? htmlBg : null;
    if (!bg) {
      const prefersDark =
        typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
      bg = prefersDark || relativeLuminance(fg) > 0.6 ? { r: 9, g: 10, b: 11, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    }

    const isDark = relativeLuminance(bg) < 0.5;

    const link = document.querySelector("a[href]");
    const linkColor = link ? parseColor(getComputedStyle(link).color) : null;
    const accent = linkColor && linkColor.a > 0.5 ? linkColor : fg;
    const accentContrast = relativeLuminance(accent) > 0.6 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

    const surface = rgbaCss(bg, isDark ? 0.62 : 0.72);
    const surfaceStrong = rgbaCss(bg, isDark ? 0.82 : 0.92);
    const border = rgbaCss(fg, isDark ? 0.22 : 0.14);
    const muted = rgbaCss(fg, isDark ? 0.72 : 0.68);
    const bubbleAssistant = rgbCss(mixRgb(bg, fg, isDark ? 0.08 : 0.04));
    const bubbleUser = rgbCss(mixRgb(bg, fg, isDark ? 0.14 : 0.07));
    const codeBg = rgbCss(mixRgb(bg, fg, isDark ? 0.18 : 0.09));
    const scrim = isDark ? "rgba(0, 0, 0, 0.55)" : "rgba(0, 0, 0, 0.22)";
    const shadowColor = isDark ? "rgba(0, 0, 0, 0.62)" : "rgba(0, 0, 0, 0.20)";
    const focus = rgbaCss(accent, isDark ? 0.45 : 0.32);

    return {
      fontFamily,
      fontSize,
      fg: rgbCss(fg),
      bg: rgbCss(bg),
      muted,
      surface,
      surfaceStrong,
      border,
      shadowColor,
      scrim,
      accent: rgbCss(accent),
      accentContrast: rgbCss(accentContrast),
      bubbleAssistant,
      bubbleUser,
      codeBg,
      focus,
    };
  }

  function applyThemeVariables(host) {
    const theme = inferThemeFromPage();
    host.style.setProperty("--cta-font-family", theme.fontFamily);
    host.style.setProperty("--cta-font-size", theme.fontSize);
    host.style.setProperty("--cta-fg", theme.fg);
    host.style.setProperty("--cta-bg", theme.bg);
    host.style.setProperty("--cta-fg-muted", theme.muted);
    host.style.setProperty("--cta-surface", theme.surface);
    host.style.setProperty("--cta-surface-strong", theme.surfaceStrong);
    host.style.setProperty("--cta-border", theme.border);
    host.style.setProperty("--cta-shadow-color", theme.shadowColor);
    host.style.setProperty("--cta-scrim", theme.scrim);
    host.style.setProperty("--cta-accent", theme.accent);
    host.style.setProperty("--cta-accent-contrast", theme.accentContrast);
    host.style.setProperty("--cta-bubble-assistant", theme.bubbleAssistant);
    host.style.setProperty("--cta-bubble-user", theme.bubbleUser);
    host.style.setProperty("--cta-code-bg", theme.codeBg);
    host.style.setProperty("--cta-focus", theme.focus);
  }

  function observeTheme(host) {
    let frame = null;
    const requestSync = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        applyThemeVariables(host);
      });
    };

    applyThemeVariables(host);

    const observer = new MutationObserver(requestSync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    }

    if (typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", requestSync);
      } else if (typeof mq.addListener === "function") {
        mq.addListener(requestSync);
      }
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function getScriptData() {
    const current = document.currentScript;
    const fromCurrent =
      current && current.tagName === "SCRIPT" && current.getAttribute && current.getAttribute("data-agent-id") ? current : null;
    const script =
      fromCurrent ||
      (() => {
        const scripts = document.querySelectorAll("script[data-agent-id]");
        return scripts.length ? scripts[scripts.length - 1] : null;
      })();
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

  function loadUiState() {
    try {
      const raw = localStorage.getItem(UI_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function saveUiState(ui) {
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(ui || {}));
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
      :host {
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        z-index: 2147483000;
        font-family: var(--cta-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        font-size: var(--cta-font-size, 14px);
        color: var(--cta-fg, #111827);
        --cta-bg: #ffffff;
        --cta-fg-muted: rgba(17, 24, 39, 0.7);
        --cta-surface: rgba(255, 255, 255, 0.72);
        --cta-surface-strong: rgba(255, 255, 255, 0.92);
        --cta-border: rgba(17, 24, 39, 0.12);
        --cta-shadow-color: rgba(0, 0, 0, 0.2);
        --cta-scrim: rgba(0, 0, 0, 0.22);
        --cta-accent: rgb(37, 99, 235);
        --cta-accent-contrast: rgb(255, 255, 255);
        --cta-bubble-assistant: rgba(17, 24, 39, 0.06);
        --cta-bubble-user: rgba(17, 24, 39, 0.08);
        --cta-code-bg: rgba(17, 24, 39, 0.1);
        --cta-focus: rgba(37, 99, 235, 0.32);
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      button,
      input {
        font: inherit;
        color: inherit;
      }

      .cta-widget-toggle {
        position: fixed;
        top: 70vh;
        right: calc(16px + env(safe-area-inset-right, 0px));
        transform: translateY(-50%) translateX(10px);
        width: 44px;
        height: 44px;
        border-radius: 999px;
        background: var(--cta-surface);
        border: 1px solid var(--cta-border);
        color: var(--cta-accent);
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        opacity: 0.82;
        z-index: 2;
        touch-action: none;
        transition: transform 160ms ease, opacity 160ms ease, box-shadow 160ms ease;
        box-shadow: 0 18px 60px var(--cta-shadow-color);
        backdrop-filter: blur(18px) saturate(160%);
        -webkit-backdrop-filter: blur(18px) saturate(160%);
      }

      .cta-widget-toggle:hover,
      .cta-widget-toggle:focus-visible,
      .cta-widget-toggle.dragging {
        transform: translateY(-50%) translateX(0);
        opacity: 1;
      }

      .cta-widget-toggle.dragging {
        cursor: grabbing;
      }

      .cta-widget-toggle.open {
        opacity: 0;
        pointer-events: none;
        transform: translateY(-50%) translateX(18px);
      }

      .cta-widget-toggle:focus-visible {
        outline: none;
        box-shadow: 0 18px 60px var(--cta-shadow-color), 0 0 0 4px var(--cta-focus);
      }

      .cta-widget-toggle svg {
        width: 22px;
        height: 22px;
      }

      .cta-widget-toggle.has-unread::after {
        content: "";
        position: absolute;
        top: 8px;
        right: 8px;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--cta-accent);
        box-shadow: 0 0 0 2px var(--cta-surface-strong), 0 0 0 0 var(--cta-focus);
        pointer-events: none;
      }

      .cta-widget-toggle.unread-pulse::after {
        animation: cta-widget-unread-pulse 420ms ease-out;
      }

      @keyframes cta-widget-unread-pulse {
        0% {
          transform: scale(0.9);
          box-shadow: 0 0 0 2px var(--cta-surface-strong), 0 0 0 0 var(--cta-focus);
        }
        70% {
          transform: scale(1.25);
          box-shadow: 0 0 0 2px var(--cta-surface-strong), 0 0 0 14px rgba(0, 0, 0, 0);
        }
        100% {
          transform: scale(1);
          box-shadow: 0 0 0 2px var(--cta-surface-strong), 0 0 0 0 rgba(0, 0, 0, 0);
        }
      }

      @media (hover: none) {
        .cta-widget-toggle {
          transform: translateY(-50%);
          opacity: 0.9;
        }
      }

      .cta-widget-scrim {
        position: fixed;
        inset: 0;
        background: var(--cta-scrim);
        opacity: 0;
        pointer-events: none;
        transition: opacity 200ms ease;
      }

      @media (max-width: 900px) {
        .cta-widget-scrim.open {
          opacity: 1;
          pointer-events: auto;
        }
      }

      .cta-widget-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(440px, calc(100vw - 56px));
        max-width: 100vw;
        background: var(--cta-surface);
        border-left: 1px solid var(--cta-border);
        box-shadow: 0 18px 60px var(--cta-shadow-color);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
        pointer-events: none;
        opacity: 0;
        transform: translateX(calc(100% + 16px));
        transition: transform 240ms cubic-bezier(0.2, 0.9, 0.2, 1), opacity 200ms ease;
        border-radius: 18px 0 0 18px;
        z-index: 3;
        backdrop-filter: blur(22px) saturate(160%);
        -webkit-backdrop-filter: blur(22px) saturate(160%);
      }

      .cta-widget-panel.open {
        pointer-events: auto;
        opacity: 1;
        transform: translateX(0);
      }

      @media (max-width: 640px) {
        .cta-widget-panel {
          width: 100vw;
          border-radius: 0;
        }
      }

      .cta-widget-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        padding-top: calc(14px + env(safe-area-inset-top, 0px));
        border-bottom: 1px solid var(--cta-border);
        background: var(--cta-surface-strong);
      }

      .cta-widget-header-left {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .cta-widget-avatar {
        width: 36px;
        height: 36px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--cta-bubble-assistant);
        border: 1px solid var(--cta-border);
        flex-shrink: 0;
        position: relative;
      }

      .cta-widget-avatar svg {
        width: 18px;
        height: 18px;
        color: var(--cta-accent);
      }

      .cta-widget-avatar .cta-status {
        position: absolute;
        bottom: -3px;
        left: -3px;
        width: 10px;
        height: 10px;
        background: rgb(34, 197, 94);
        border-radius: 999px;
        box-shadow: 0 0 0 2px var(--cta-surface-strong);
      }

      .cta-widget-title {
        font-size: 13px;
        font-weight: 650;
        letter-spacing: -0.01em;
        margin: 0;
        color: var(--cta-fg);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .cta-widget-subtitle {
        font-size: 12px;
        margin: 0;
        color: var(--cta-fg-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .cta-widget-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .cta-widget-close {
        width: 36px;
        height: 36px;
        padding: 0;
        background: transparent;
        border: 1px solid var(--cta-border);
        cursor: pointer;
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        opacity: 0.9;
        transition: opacity 160ms ease, border-color 160ms ease, transform 160ms ease;
      }

      .cta-widget-close:hover {
        opacity: 1;
        border-color: var(--cta-accent);
      }

      .cta-widget-close-hint {
        display: none;
        align-items: center;
        padding: 2px 6px;
        border-radius: 8px;
        border: 1px solid var(--cta-border);
        color: var(--cta-fg-muted);
        font-size: 11px;
        line-height: 1;
        opacity: 0.8;
      }

      @media (hover: hover) and (pointer: fine) {
        .cta-widget-close {
          width: auto;
          padding: 0 10px;
        }

        .cta-widget-close-hint {
          display: inline-flex;
        }
      }

      .cta-widget-close:active {
        transform: translateY(1px);
      }

      .cta-widget-close:focus-visible {
        outline: none;
        box-shadow: 0 0 0 4px var(--cta-focus);
      }

      .cta-widget-close svg {
        width: 18px;
        height: 18px;
      }

      .cta-widget-new-chat {
        height: 36px;
        padding: 0 10px;
        background: transparent;
        border: 1px solid var(--cta-border);
        border-radius: 12px;
        cursor: pointer;
        font-size: 12px;
        opacity: 0.9;
        transition: opacity 160ms ease, border-color 160ms ease, transform 160ms ease;
      }

      .cta-widget-new-chat:hover {
        opacity: 1;
        border-color: var(--cta-accent);
      }

      .cta-widget-new-chat:active {
        transform: translateY(1px);
      }

      .cta-widget-new-chat:focus-visible {
        outline: none;
        box-shadow: 0 0 0 4px var(--cta-focus);
      }

      .cta-widget-messages {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        scrollbar-width: thin;
        scrollbar-color: var(--cta-border) transparent;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }

      .cta-widget-messages::-webkit-scrollbar {
        width: 10px;
      }

      .cta-widget-messages::-webkit-scrollbar-thumb {
        background: var(--cta-border);
        border-radius: 999px;
        border: 3px solid transparent;
        background-clip: content-box;
      }

      .cta-widget-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 28px 18px;
        color: var(--cta-fg-muted);
      }

      .cta-widget-empty-icon {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
        background: var(--cta-bubble-assistant);
        border: 1px solid var(--cta-border);
      }

      .cta-widget-empty-icon svg {
        width: 28px;
        height: 28px;
        color: var(--cta-accent);
      }

      .cta-widget-empty h3 {
        font-size: 14px;
        font-weight: 650;
        margin: 0 0 8px;
        color: var(--cta-fg);
        letter-spacing: -0.01em;
      }

      .cta-widget-empty p {
        font-size: 13px;
        margin: 0;
        max-width: 320px;
      }

      .cta-widget-message {
        max-width: 92%;
        padding: 10px 12px;
        border-radius: 16px;
        font-size: 13px;
        line-height: 1.55;
        word-wrap: break-word;
        border: 1px solid var(--cta-border);
      }

      .cta-widget-message.user {
        align-self: flex-end;
        background: var(--cta-bubble-user);
        border-bottom-right-radius: 6px;
      }

      .cta-widget-message.assistant {
        align-self: flex-start;
        background: var(--cta-bubble-assistant);
        border-bottom-left-radius: 6px;
      }

      .cta-widget-message h1,
      .cta-widget-message h2,
      .cta-widget-message h3,
      .cta-widget-message h4,
      .cta-widget-message h5,
      .cta-widget-message h6 {
        margin: 0 0 8px;
        line-height: 1.25;
        font-weight: 700;
        letter-spacing: -0.01em;
      }

      .cta-widget-message h1 { font-size: 16px; }
      .cta-widget-message h2 { font-size: 15px; }
      .cta-widget-message h3,
      .cta-widget-message h4,
      .cta-widget-message h5,
      .cta-widget-message h6 { font-size: 14px; }

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
        padding-left: 18px;
      }

      .cta-widget-message li {
        margin-bottom: 6px;
      }

      .cta-widget-message blockquote {
        padding-left: 10px;
        border-left: 3px solid var(--cta-border);
        color: var(--cta-fg-muted);
      }

      .cta-widget-message a {
        color: var(--cta-accent);
        text-decoration: underline;
        word-break: break-word;
      }

      .cta-widget-message code {
        background: var(--cta-code-bg);
        padding: 2px 6px;
        border-radius: 8px;
        font-size: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        border: 1px solid var(--cta-border);
      }

      .cta-widget-message pre {
        background: var(--cta-code-bg);
        padding: 10px;
        border-radius: 14px;
        overflow-x: auto;
        max-width: 100%;
        border: 1px solid var(--cta-border);
      }

      .cta-widget-message pre code {
        background: transparent;
        padding: 0;
        border: none;
      }

      .cta-widget-message table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        display: block;
        overflow-x: auto;
      }

      .cta-widget-message img {
        max-width: 100%;
        height: auto;
        display: block;
        border-radius: 12px;
        border: 1px solid var(--cta-border);
      }

      .cta-widget-message th,
      .cta-widget-message td {
        border: 1px solid var(--cta-border);
        padding: 8px 10px;
        text-align: left;
      }

      .cta-widget-message > :last-child {
        margin-bottom: 0;
      }

      .cta-widget-loading {
        align-self: flex-start;
        display: flex;
        gap: 6px;
        padding: 12px;
      }

      .cta-widget-loading span {
        width: 7px;
        height: 7px;
        background: var(--cta-fg-muted);
        border-radius: 999px;
        animation: cta-bounce 1.4s ease-in-out infinite;
      }

      .cta-widget-loading span:nth-child(2) { animation-delay: 0.2s; }
      .cta-widget-loading span:nth-child(3) { animation-delay: 0.4s; }

      @keyframes cta-bounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
      }

      .cta-widget-input-area {
        padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid var(--cta-border);
        background: var(--cta-surface-strong);
      }

      .cta-widget-input-row {
        display: flex;
        gap: 8px;
        align-items: flex-end;
      }

      .cta-widget-input {
        flex: 1;
        height: 48px;
        padding: 0 14px;
        border: 1px solid transparent;
        border-radius: 14px;
        background: var(--cta-surface);
        color: var(--cta-fg);
        outline: none;
        min-width: 0;
        font-size: 13px;
        box-shadow: inset 0 0 0 1px var(--cta-border);
        transition: box-shadow 90ms ease, background-color 90ms ease;
      }

      .cta-widget-input::placeholder {
        color: var(--cta-fg-muted);
      }

      .cta-widget-input:focus {
        box-shadow: inset 0 0 0 1px var(--cta-accent);
      }

      .cta-widget-send {
        width: 48px;
        height: 48px;
        background: var(--cta-accent);
        border: 1px solid var(--cta-accent);
        border-radius: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 160ms ease, opacity 160ms ease;
        flex-shrink: 0;
        color: var(--cta-accent-contrast);
      }

      .cta-widget-send:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      .cta-widget-send:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .cta-widget-send:focus-visible {
        outline: none;
        box-shadow: 0 0 0 4px var(--cta-focus);
      }

      .cta-widget-send svg {
        width: 18px;
        height: 18px;
        color: currentColor;
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
        width: 48px;
        height: 48px;
        border: 1px solid var(--cta-border);
        border-radius: 14px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease, transform 160ms ease;
        flex-shrink: 0;
      }

      .cta-widget-mic svg {
        width: 18px;
        height: 18px;
        color: var(--cta-fg);
        opacity: 0.9;
      }

      .cta-widget-mic.paired {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
      }

      .cta-widget-mic-select {
        width: 36px;
        height: 48px;
        border: 1px solid var(--cta-border);
        border-left: none;
        border-radius: 0 14px 14px 0;
        margin-left: -1px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease, transform 160ms ease;
        flex-shrink: 0;
      }

      .cta-widget-mic-select svg {
        width: 14px;
        height: 14px;
        color: var(--cta-fg);
        opacity: 0.85;
      }

      .cta-widget-mic:disabled,
      .cta-widget-mic-select:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .cta-widget-mic:hover:not(:disabled),
      .cta-widget-mic-select:hover:not(:disabled) {
        border-color: var(--cta-accent);
      }

      .cta-widget-mic:focus-visible,
      .cta-widget-mic-select:focus-visible {
        outline: none;
        box-shadow: 0 0 0 4px var(--cta-focus);
      }

      .cta-widget-mic.recording {
        border-color: rgb(239, 68, 68);
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.22);
        animation: cta-pulse 1.2s ease-in-out infinite;
      }

      .cta-mic-dot {
        position: absolute;
        top: 7px;
        right: 7px;
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: rgb(239, 68, 68);
        box-shadow: 0 0 0 2px var(--cta-surface-strong);
        opacity: 0;
        transition: opacity 160ms ease;
      }

      .cta-widget-mic.recording .cta-mic-dot {
        opacity: 1;
      }

      .cta-widget-mic-menu {
        position: absolute;
        bottom: 48px;
        right: 0;
        min-width: 220px;
        background: var(--cta-surface-strong);
        border: 1px solid var(--cta-border);
        border-radius: 14px;
        box-shadow: 0 18px 60px var(--cta-shadow-color);
        display: none;
        overflow: hidden;
        z-index: 5;
        backdrop-filter: blur(18px) saturate(160%);
        -webkit-backdrop-filter: blur(18px) saturate(160%);
      }

      .cta-widget-mic-menu.open {
        display: block;
      }

      .cta-widget-mic-menu button {
        width: 100%;
        padding: 10px 12px;
        text-align: left;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 12px;
        color: var(--cta-fg);
      }

      .cta-widget-mic-menu button:hover {
        background: var(--cta-bubble-assistant);
      }

      .cta-widget-mic-menu button.active {
        background: var(--cta-bubble-user);
      }

      .cta-voice-hint,
      .cta-voice-error {
        margin-top: 8px;
        padding: 8px 10px;
        font-size: 12px;
        line-height: 1.35;
        text-align: center;
        border-radius: 12px;
        display: none;
        justify-content: center;
        border: 1px solid var(--cta-border);
        background: var(--cta-bubble-assistant);
        color: var(--cta-fg-muted);
      }

      .cta-voice-error {
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.32);
        color: rgb(185, 28, 28);
      }

      @keyframes cta-pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.03); }
        100% { transform: scale(1); }
      }

      @media (prefers-reduced-motion: reduce) {
        .cta-widget-toggle,
        .cta-widget-panel,
        .cta-widget-scrim,
        .cta-widget-send,
        .cta-widget-new-chat,
        .cta-widget-close,
        .cta-widget-mic,
        .cta-widget-mic-select {
          transition: none !important;
        }

        .cta-widget-loading span,
        .cta-widget-mic.recording {
          animation: none !important;
        }

        .cta-widget-toggle.unread-pulse::after {
          animation: none !important;
        }
      }
    `;
    return style;
  }

  function createWidget(config) {
    const apiUrl = API_URL;
    const state = loadState() || { messages: [], conversationId: null, voice: {}, auth: {}, ui: {} };
    if (!state.voice) state.voice = {};
    if (!state.auth) state.auth = {};
    if (!state.ui) state.ui = {};
    const savedUi = loadUiState();
    if (savedUi && typeof savedUi.launcherY === "number") {
      state.ui.launcherY = clamp(savedUi.launcherY, 0, 1);
    }
    if (typeof state.ui.launcherY !== "number") {
      state.ui.launcherY = 0.72;
      saveUiState(state.ui);
      saveState(state);
    }
    let headerConfig = {};
    let widgetAuthToken = state.auth.token || null;
    let widgetRefreshEndpointPath = "/widget-token";
    let configPromise = null;
    let isLoading = false;
    let isOpen = false;
    let hasUnread = false;
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

    const root = document.createElement("div");

    const scrim = document.createElement("div");
    scrim.className = "cta-widget-scrim";

    const toggle = document.createElement("button");
    toggle.className = "cta-widget-toggle";
    toggle.setAttribute("aria-label", "Open Warpy");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"/>
        <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"/>
        <path d="M18 14l.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5z"/>
      </svg>
    `;

    const panel = document.createElement("div");
    panel.className = "cta-widget-panel";
    panel.id = "cta-widget-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Warpy");
    toggle.setAttribute("aria-controls", panel.id);
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
            <p class="cta-widget-title">Warpy</p>
            <p class="cta-widget-subtitle">Ready to act</p>
          </div>
        </div>
        <div class="cta-widget-header-actions">
          <button class="cta-widget-new-chat">New chat</button>
          <button class="cta-widget-close" aria-label="Close (Esc)" aria-keyshortcuts="Escape" title="Close (Esc)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            <span class="cta-widget-close-hint" aria-hidden="true">Esc</span>
          </button>
        </div>
      </div>
      <div class="cta-widget-messages"></div>
      <div class="cta-widget-input-area">
        <div class="cta-widget-input-row">
          <input type="text" class="cta-widget-input" placeholder="Ask Warpy…" />
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

    root.appendChild(scrim);
    root.appendChild(toggle);
    root.appendChild(panel);

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

    function getViewportHeight() {
      if (window.visualViewport && typeof window.visualViewport.height === "number") {
        return window.visualViewport.height;
      }
      return window.innerHeight;
    }

    function applyLauncherPosition() {
      const height = getViewportHeight();
      const safe = 72;
      const top = clamp(height * clamp(state.ui.launcherY, 0, 1), safe, height - safe);
      toggle.style.top = `${Math.round(top)}px`;
    }

    function persistLauncherPosition() {
      const height = getViewportHeight();
      const top = parseFloat(toggle.style.top);
      if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) return;
      state.ui.launcherY = clamp(top / height, 0, 1);
      saveUiState(state.ui);
      saveState(state);
    }

    applyLauncherPosition();

    if (window.visualViewport && typeof window.visualViewport.addEventListener === "function") {
      window.visualViewport.addEventListener("resize", applyLauncherPosition, { passive: true });
      window.visualViewport.addEventListener("scroll", applyLauncherPosition, { passive: true });
    } else {
      window.addEventListener("resize", applyLauncherPosition, { passive: true });
    }

    let ignoreToggleClick = false;
    let dragPointerId = null;
    let dragStartClientY = 0;
    let dragStartTop = 0;

    function stopDragging(event) {
      if (dragPointerId === null) return;
      if (event && dragPointerId !== event.pointerId) return;
      try {
        if (event && toggle.hasPointerCapture(event.pointerId)) {
          toggle.releasePointerCapture(event.pointerId);
        }
      } catch {}
      toggle.classList.remove("dragging");
      if (ignoreToggleClick) {
        persistLauncherPosition();
        setTimeout(() => {
          ignoreToggleClick = false;
        }, 0);
      }
      dragPointerId = null;
    }

    toggle.addEventListener("pointerdown", (event) => {
      if (isOpen) return;
      if (typeof event.button === "number" && event.button !== 0) return;
      dragPointerId = event.pointerId;
      dragStartClientY = event.clientY;
      dragStartTop =
        parseFloat(toggle.style.top) || toggle.getBoundingClientRect().top + toggle.getBoundingClientRect().height / 2;
      toggle.classList.add("dragging");
      try {
        toggle.setPointerCapture(event.pointerId);
      } catch {}
    });

    toggle.addEventListener("pointermove", (event) => {
      if (dragPointerId !== event.pointerId) return;
      const delta = event.clientY - dragStartClientY;
      if (Math.abs(delta) < 6) return;
      const height = getViewportHeight();
      const safe = 72;
      const nextTop = clamp(dragStartTop + delta, safe, height - safe);
      toggle.style.top = `${Math.round(nextTop)}px`;
      ignoreToggleClick = true;
    });

    toggle.addEventListener("pointerup", stopDragging);
    toggle.addEventListener("pointercancel", stopDragging);

    scrim.addEventListener("click", () => {
      if (isOpen) togglePanel();
    });

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
            <h3>What would you like to do?</h3>
            <p>Ask a question, request help, or describe what you want to get done.</p>
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
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const isInside =
        path.includes(micMenuEl) ||
        path.includes(micSelectEl) ||
        path.includes(micEl) ||
        micMenuEl.contains(event.target) ||
        micSelectEl.contains(event.target) ||
        micEl.contains(event.target);
      if (isInside) return;
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

    function setUnread(nextHasUnread) {
      hasUnread = Boolean(nextHasUnread);
      toggle.classList.toggle("has-unread", hasUnread);
      toggle.setAttribute("aria-label", hasUnread ? "Open Warpy (new message)" : "Open Warpy");
    }

    function playUnreadPulse() {
      toggle.classList.remove("unread-pulse");
      void toggle.offsetWidth;
      toggle.classList.add("unread-pulse");
    }

    async function sendMessage(text) {
      if (!text.trim() || isLoading) return;

      state.messages.push({ role: "user", content: text.trim() });
      saveState(state);
      renderMessages();
      setLoading(true);

      let didReceiveAssistant = false;
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
            if (msg.role === "assistant") {
              didReceiveAssistant = true;
            }
          }
        }

        saveState(state);
      } catch (error) {
        state.messages.push({
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        });
        didReceiveAssistant = true;
        saveState(state);
      }

      if (!isOpen && didReceiveAssistant) {
        setUnread(true);
        playUnreadPulse();
      }

      setLoading(false);
    }

    function openPanel() {
      if (isOpen) return;
      isOpen = true;
      setUnread(false);
      panel.classList.add("open");
      scrim.classList.add("open");
      toggle.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      inputEl.focus();
      renderMessages();
    }

    function closePanel({ restoreLauncherFocus = true } = {}) {
      if (!isOpen) return;
      isOpen = false;
      panel.classList.remove("open");
      scrim.classList.remove("open");
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      closeMicMenu();
      stopRecording();
      if (restoreLauncherFocus) {
        toggle.focus();
      } else {
        inputEl.blur();
      }
    }

    function togglePanel() {
      if (isOpen) {
        closePanel();
      } else {
        openPanel();
      }
    }

    function startNewChat() {
      state.messages = [];
      state.conversationId = null;
      saveState(state);
      setUnread(false);
      renderMessages();
    }

    toggle.addEventListener("click", () => {
      if (ignoreToggleClick) return;
      togglePanel();
    });
    toggle.addEventListener("animationend", (event) => {
      if (event.animationName === "cta-widget-unread-pulse") {
        toggle.classList.remove("unread-pulse");
      }
    });
    closeEl.addEventListener("click", togglePanel);
    newChatEl.addEventListener("click", startNewChat);
    document.addEventListener("keydown", (event) => {
      if (!isOpen) return;
      if (event.key !== "Escape") return;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const isFromWidget = path.includes(panel) || path.includes(root);
      if (isFromWidget) {
        event.stopPropagation();
      }
      closePanel({ restoreLauncherFocus: false });
    });
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

    return root;
  }

  function init() {
    const config = getScriptData();
    if (!config || !config.agentId) {
      console.warn("[Warpy] Missing data-agent-id attribute");
      return;
    }

    if (document.getElementById(WIDGET_CONTAINER_ID)) {
      return;
    }

    const host = document.createElement("div");
    host.id = WIDGET_CONTAINER_ID;
    const shadowRoot = host.attachShadow({ mode: "open" });
    shadowRoot.appendChild(createStyles());
    shadowRoot.appendChild(createWidget(config));
    observeTheme(host);
    document.body.appendChild(host);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
