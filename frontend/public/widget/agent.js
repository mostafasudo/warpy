(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════════════════════
  // Constants
  // ═══════════════════════════════════════════════════════════════════════════

  const STORAGE_KEY = "cta_widget_state";
  const UI_STORAGE_KEY = "cta_widget_ui_state";
  const API_TIMEOUT = 30000;
  const API_URL = "http://localhost:8000";
  const PROD_API_URL = "https://api.warpy.ai";
  const LOCAL_PORT_OFFSET = 2827;
  const MARKED_SRC = "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js";
  const MARKED_INTEGRITY = "sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi";
  const DOMPURIFY_SRC = "https://cdn.jsdelivr.net/npm/dompurify@3.1.2/dist/purify.min.js";
  const DOMPURIFY_INTEGRITY = "sha384-Y2u+tbsy03z8jtFrNMeiCU+7VdECSbkt7TIkTU95qOc01ZuCLYXbHnfuJa6WHLHw";
  const WIDGET_CONTAINER_ID = "cta-widget-container";
  const FRONTEND_WARNING_LEAD_MS = 450;
  const FRONTEND_WARNING_MIN_VISIBLE_MS = 2400;
  const FRONTEND_WARNING_HOLD_MS = 2200;
  const SCREEN_SHARE_TIMEOUT_MS = 20000;
  const PAGE_PUSH_BREAKPOINT = 900;
  const PAGE_PUSH_ACTIVE_ATTR = "data-cta-widget-push-active";
  const PAGE_PUSH_READY_ATTR = "data-cta-widget-push-ready";
  const PAGE_PUSH_OFFSET_VAR = "--cta-widget-push-offset";
  const PAGE_PUSH_STYLE_ID = "cta-widget-page-push-style";
  const PAGE_PUSH_TRANSITION_MS = 240;
  const PANEL_BASE_MIN_WIDTH = 440;
  const PANEL_BASE_MAX_WIDTH = 680;
  const PANEL_VIEWPORT_GUTTER = 56;
  const PANEL_MOBILE_BREAKPOINT = 640;
  const PANEL_RESIZE_STEP = 32;

  // ═══════════════════════════════════════════════════════════════════════════
  // Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, Math.round(num)));
  }

  function createAbortError() {
    const error = new Error("Execution stopped");
    error.name = "AbortError";
    return error;
  }

  function isAbortError(error) {
    return Boolean(error && (error.name === "AbortError" || error.code === "ABORT_ERR"));
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) {
      throw createAbortError();
    }
  }

  function sleep(ms, signal) {
    const delay = Math.max(0, Number(ms) || 0);
    if (!signal) {
      return new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (signal.aborted) {
      return Promise.reject(createAbortError());
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, delay);
      const onAbort = () => {
        clearTimeout(timeoutId);
        signal.removeEventListener("abort", onAbort);
        reject(createAbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Levenshtein distance for fuzzy matching
  function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  function truncateText(value, limit) {
    const text = String(value || "");
    if (!limit || text.length <= limit) return text;
    return text.slice(0, limit) + "...";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Color Parsing & Manipulation
  // ═══════════════════════════════════════════════════════════════════════════

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

  function colorCss(color) {
    if (!color) return null;
    return color.a < 1 ? rgbaCss(color, color.a) : rgbCss(color);
  }

  function applyAlpha(color, alpha) {
    return { r: color.r, g: color.g, b: color.b, a: clamp(alpha, 0, 1) };
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

  function createCssColorResolver() {
    const mount = document.body || document.documentElement;
    if (!mount) {
      return {
        resolve: () => null,
        cleanup: () => { },
      };
    }

    const probe = document.createElement("span");
    probe.style.position = "fixed";
    probe.style.left = "-99999px";
    probe.style.top = "-99999px";
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    mount.appendChild(probe);

    return {
      resolve: (value) => {
        const expression = typeof value === "string" ? value.trim() : "";
        if (!expression) return null;
        probe.style.color = "";
        probe.style.color = expression;
        if (!probe.style.color && !/^var\(/i.test(expression)) return null;
        const computed = getComputedStyle(probe).color;
        return parseColor(computed);
      },
      cleanup: () => {
        if (probe.parentNode) {
          probe.parentNode.removeChild(probe);
        }
      },
    };
  }

  function resolveTokenColor(stylesList, tokenNames, resolveCssColor) {
    const readCustomProperty = (name) => {
      for (const styles of stylesList) {
        if (!styles || typeof styles.getPropertyValue !== "function") continue;
        const value = styles.getPropertyValue(name).trim();
        if (value) return value;
      }
      return "";
    };

    const expandTokenValue = (rawValue) => {
      let value = rawValue;
      const seen = new Set();
      for (let i = 0; i < 6; i += 1) {
        const match = value.match(/^var\(\s*(--[^,\s)]+)\s*(?:,\s*([^)]+))?\)$/i);
        if (!match) break;
        const variableName = match[1];
        if (seen.has(variableName)) break;
        seen.add(variableName);
        const resolved = readCustomProperty(variableName);
        if (resolved) {
          value = resolved;
          continue;
        }
        const fallback = match[2] ? match[2].trim() : "";
        if (!fallback) break;
        value = fallback;
      }
      return value;
    };

    for (const token of tokenNames) {
      for (const styles of stylesList) {
        if (!styles || typeof styles.getPropertyValue !== "function") continue;
        const raw = styles.getPropertyValue(token).trim();
        if (!raw) continue;
        const value = expandTokenValue(raw);
        if (/^var\(/i.test(value)) continue;
        const candidates = [];
        candidates.push(value);
        if (!/[#(]/.test(value) && !/^var\(/i.test(value)) {
          if (/%/.test(value)) {
            candidates.push(`hsl(${value})`);
            candidates.push(`oklch(${value})`);
          } else {
            candidates.push(`oklch(${value})`);
            candidates.push(`hsl(${value})`);
          }
        }
        for (const candidate of candidates) {
          const resolved = resolveCssColor(candidate);
          if (resolved) return resolved;
        }
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Theme Detection & Application
  // ═══════════════════════════════════════════════════════════════════════════

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

    const link = document.querySelector("a[href]");
    const linkColor = link ? parseColor(getComputedStyle(link).color) : null;
    const fallbackAccent = linkColor && linkColor.a > 0.5 ? linkColor : fg;
    const fallbackIsDark = relativeLuminance(bg) < 0.5;
    const fallbackAccentContrast = relativeLuminance(fallbackAccent) > 0.6 ? { r: 0, g: 0, b: 0, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    const fallbackSurface = applyAlpha(bg, fallbackIsDark ? 0.62 : 0.72);
    const fallbackSurfaceStrong = applyAlpha(bg, fallbackIsDark ? 0.82 : 0.92);
    const fallbackBorder = applyAlpha(fg, fallbackIsDark ? 0.22 : 0.14);
    const fallbackMuted = applyAlpha(fg, fallbackIsDark ? 0.72 : 0.68);
    const fallbackBubbleAssistant = mixRgb(bg, fg, fallbackIsDark ? 0.08 : 0.04);
    const fallbackBubbleUser = mixRgb(bg, fg, fallbackIsDark ? 0.14 : 0.07);
    const fallbackCodeBg = mixRgb(bg, fg, fallbackIsDark ? 0.18 : 0.09);

    const styleSources = [bodyStyles, htmlStyles];
    const resolver = createCssColorResolver();
    const resolveCssColor = resolver.resolve;
    let themedFg;
    let themedBg;
    let themedAccent;
    let themedAccentContrast;
    let themedSurface;
    let themedSurfaceStrong;
    let themedMuted;
    let themedBorder;
    let themedBubbleAssistant;
    let themedBubbleUser;
    let themedCodeBg;
    let themedFocus;
    try {
      themedFg = resolveTokenColor(styleSources, ["--foreground", "--color-foreground"], resolveCssColor) || fg;
      themedBg = resolveTokenColor(styleSources, ["--background", "--color-background", "--surface"], resolveCssColor) || bg;
      themedAccent = resolveTokenColor(styleSources, ["--primary", "--accent", "--color-primary"], resolveCssColor) || fallbackAccent;
      themedAccentContrast =
        resolveTokenColor(styleSources, ["--primary-foreground", "--accent-foreground", "--color-primary-foreground"], resolveCssColor) ||
        fallbackAccentContrast;
      themedSurface =
        resolveTokenColor(styleSources, ["--card", "--popover", "--surface", "--background"], resolveCssColor) || fallbackSurface;
      themedSurfaceStrong =
        resolveTokenColor(styleSources, ["--popover", "--card", "--surface", "--background"], resolveCssColor) || fallbackSurfaceStrong;
      themedMuted =
        resolveTokenColor(
          styleSources,
          ["--muted-foreground", "--color-muted-foreground", "--secondary-foreground", "--foreground"],
          resolveCssColor
        ) || fallbackMuted;
      themedBorder =
        resolveTokenColor(styleSources, ["--border", "--input", "--separator", "--color-border"], resolveCssColor) || fallbackBorder;
      themedBubbleAssistant =
        resolveTokenColor(styleSources, ["--muted", "--secondary", "--card", "--surface"], resolveCssColor) || fallbackBubbleAssistant;
      themedBubbleUser =
        resolveTokenColor(styleSources, ["--secondary", "--muted", "--card", "--surface"], resolveCssColor) || fallbackBubbleUser;
      themedCodeBg =
        resolveTokenColor(styleSources, ["--muted", "--secondary", "--card", "--surface"], resolveCssColor) || fallbackCodeBg;
      themedFocus =
        resolveTokenColor(styleSources, ["--ring", "--focus", "--primary", "--accent", "--color-ring"], resolveCssColor) ||
        applyAlpha(themedAccent, fallbackIsDark ? 0.45 : 0.32);
    } finally {
      resolver.cleanup();
    }

    const themedIsDark = relativeLuminance(themedBg) < 0.5;
    const borderAlpha = themedBorder.a > 0 ? themedBorder.a : 1;
    const borderSoft = applyAlpha(themedBorder, clamp(borderAlpha, 0.1, 0.18));
    const borderStrong = applyAlpha(themedBorder, clamp(borderAlpha, 0.14, 0.26));
    const scrim = themedIsDark ? "rgba(0, 0, 0, 0.55)" : "rgba(0, 0, 0, 0.22)";
    const shadowColor = themedIsDark ? "rgba(0, 0, 0, 0.62)" : "rgba(0, 0, 0, 0.2)";

    return {
      fontFamily,
      fontSize,
      fg: colorCss(themedFg),
      bg: colorCss(themedBg),
      bgRgb: `${themedBg.r}, ${themedBg.g}, ${themedBg.b}`,
      muted: colorCss(themedMuted),
      surface: colorCss(themedSurface),
      surfaceStrong: colorCss(themedSurfaceStrong),
      border: colorCss(borderSoft),
      borderStrong: colorCss(borderStrong),
      shadowColor,
      scrim,
      accent: colorCss(themedAccent),
      accentContrast: colorCss(themedAccentContrast),
      bubbleAssistant: colorCss(themedBubbleAssistant),
      bubbleUser: colorCss(themedBubbleUser),
      codeBg: colorCss(themedCodeBg),
      focus: colorCss(themedFocus),
    };
  }

  function applyThemeVariables(host) {
    const theme = inferThemeFromPage();
    host.style.setProperty("--cta-font-family", theme.fontFamily);
    host.style.setProperty("--cta-font-size", theme.fontSize);
    host.style.setProperty("--cta-fg", theme.fg);
    host.style.setProperty("--cta-bg", theme.bg);
    host.style.setProperty("--cta-bg-rgb", theme.bgRgb);
    host.style.setProperty("--cta-fg-muted", theme.muted);
    host.style.setProperty("--cta-surface", theme.surface);
    host.style.setProperty("--cta-surface-strong", theme.surfaceStrong);
    host.style.setProperty("--cta-border", theme.border);
    host.style.setProperty("--cta-border-strong", theme.borderStrong);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // API & State Management
  // ═══════════════════════════════════════════════════════════════════════════

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function resolveApiUrl() {
    try {
      const host = window.location && window.location.hostname ? window.location.hostname : "";
      const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
      const isLocal = localHosts.has(host);
      if (!isLocal) return PROD_API_URL.replace(/\/$/, "");
      try {
        const scriptEl =
          document.currentScript ||
          (() => {
            const all = document.querySelectorAll("script[data-agent-id]");
            return all.length ? all[all.length - 1] : null;
          })();
        if (scriptEl && scriptEl.src) {
          const srcUrl = new URL(scriptEl.src);
          const fePort = parseInt(srcUrl.port, 10);
          if (fePort) return srcUrl.protocol + "//" + srcUrl.hostname + ":" + (fePort + LOCAL_PORT_OFFSET);
        }
      } catch { }
      return API_URL.replace(/\/$/, "");
    } catch {
      return PROD_API_URL;
    }
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
    } catch { }
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
    } catch { }
  }

  async function fetchWithTimeout(url, options = {}, timeout = API_TIMEOUT) {
    const controller = new AbortController();
    const externalSignal = options && options.signal ? options.signal : null;
    const requestOptions = { ...(options || {}) };
    delete requestOptions.signal;
    const forwardAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", forwardAbort, { once: true });
      }
    }
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...requestOptions, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", forwardAbort);
      }
    }
  }

  function shouldHideWidget(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (payload.isWidgetHidden === true) return true;
    const remaining = typeof payload.actionsRemaining === "number" ? payload.actionsRemaining : Number(payload.actionsRemaining);
    return Number.isFinite(remaining) && remaining <= 0;
  }

  async function fetchWidgetConfig(apiUrl, agentId, timeoutMs = API_TIMEOUT) {
    try {
      const res = await fetchWithTimeout(`${apiUrl}/widget/config/${agentId}`, {}, timeoutMs);
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
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

  function formatAuthHeaderValue(value, authType) {
    const type = authType || "bearer";
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    if (type === "basic") {
      return lower.startsWith("basic ") ? trimmed : "Basic " + trimmed;
    }
    if (type === "none") {
      return trimmed;
    }
    return lower.startsWith("bearer ") ? trimmed : "Bearer " + trimmed;
  }

  function buildHeaders(headerConfig) {
    const headers = {};
    for (const [headerName, config] of Object.entries(headerConfig)) {
      const value = extractHeaderValue(config.source, config.key);
      if (!value) continue;
      const isAuth = headerName.toLowerCase() === "authorization";
      headers[headerName] = isAuth ? formatAuthHeaderValue(value, config.authType) : value;
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

  function resolveToolType(toolCall) {
    if (!toolCall) return "backend";
    const raw = toolCall.type || toolCall.toolType;
    const normalized = raw ? String(raw) : "backend";
    if (normalized === "frontend_actions") return "frontend";
    return normalized;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Screen Capture
  // ═══════════════════════════════════════════════════════════════════════════

  let screenStream = null;
  let screenShareEndedCallback = null;

  function isScreenShareActive() {
    return Boolean(screenStream && screenStream.active && screenStream.getVideoTracks().some((t) => t.readyState === "live"));
  }

  function stopScreenShare() {
    if (!screenStream) return;
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }

  async function requestScreenShare() {
    if (isScreenShareActive()) return true;
    stopScreenShare();
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        monitorTypeSurfaces: "exclude",
        surfaceSwitching: "exclude",
        audio: false,
      });
      const track = screenStream.getVideoTracks()[0];
      if (track) {
        track.addEventListener("ended", () => {
          screenStream = null;
          if (typeof screenShareEndedCallback === "function") screenShareEndedCallback();
        }, { once: true });
      }
      return true;
    } catch {
      screenStream = null;
      return false;
    }
  }

  function captureScreenFrame() {
    if (!isScreenShareActive()) return null;
    const track = screenStream.getVideoTracks()[0];
    if (!track) return null;
    const settings = track.getSettings();
    const w = settings.width || 1280;
    const h = settings.height || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const video = document.createElement("video");
    video.srcObject = new MediaStream([track]);
    video.muted = true;
    video.playsInline = true;
    return new Promise((resolve) => {
      video.onloadeddata = () => {
        ctx.drawImage(video, 0, 0, w, h);
        video.srcObject = null;
        try {
          const dataUrl = canvas.toDataURL("image/webp", 0.75);
          resolve(dataUrl);
        } catch {
          resolve(null);
        }
      };
      video.play().catch(() => resolve(null));
      setTimeout(() => resolve(null), 3000);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM Inspection & Element Discovery
  // ═══════════════════════════════════════════════════════════════════════════

  function cssEscape(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(String(value));
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function safeQuerySelector(root, selector) {
    if (!root || !selector) return null;
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  const INTERACTIVE_SELECTOR = [
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="option"]',
    '[role="switch"]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
    "[onclick]",
  ].join(", ");

  const CLICKABLE_ROLE_SET = new Set(["button", "link", "menuitem", "option", "tab", "checkbox", "switch", "radio", "treeitem", "listitem"]);
  const TEXT_FALLBACK_SELECTOR = [
    '[role="menuitem"]',
    '[role="option"]',
    '[role="listitem"]',
    '[role="treeitem"]',
    "li",
    '[class*="menu"]',
    '[class*="dropdown"]',
    '[class*="option"]',
    '[class*="item"]',
  ].join(", ");
  const MENU_TRIGGER_SELECTOR = [
    "button",
    '[role="button"]',
    '[aria-haspopup]',
    '[aria-expanded]',
    '[data-testid]',
    '[data-test]',
    '[data-cy]',
    '[class*="menu"]',
    '[class*="dropdown"]',
  ].join(", ");
  const OVERLAY_ROOT_SELECTOR = [
    '[role="menu"]',
    '[role="listbox"]',
    '[role="dialog"]',
    '[role="tree"]',
    '[role="grid"]',
    '[role="tooltip"]',
    '[aria-modal="true"]',
    '[aria-live]',
    '[data-state="open"]',
    '[data-radix-popper-content-wrapper]',
    '[data-floating-ui-portal]',
    '[popover]',
    '[open]',
    '[class*="popover"]',
    '[class*="dropdown"]',
    '[class*="dropdown-menu"]',
    '[class*="overlay"]',
    '[class*="flyout"]',
    '[class*="panel"]',
    '[class*="menu-content"]',
    '[class*="menu"]',
    '[class*="modal"]',
  ].join(", ");
  const actionRuntimeState = {
    transientRoot: null,
  };

  const refMap = {
    _counter: 0,
    _refToElement: new Map(),
    _elementToRef: new WeakMap(),

    clear() {
      this._counter = 0;
      this._refToElement.clear();
      this._elementToRef = new WeakMap();
    },

    assign(el) {
      const existing = this._elementToRef.get(el);
      if (existing) return existing;
      this._counter += 1;
      const id = "ref_" + this._counter;
      this._refToElement.set(id, el);
      this._elementToRef.set(el, id);
      return id;
    },

    resolve(refId) {
      const el = this._refToElement.get(refId);
      if (!el || !isElementConnected(el)) {
        this._refToElement.delete(refId);
        return null;
      }
      return el;
    },

    has(refId) {
      return this._refToElement.has(refId);
    },
  };

  function isRectInViewport(rect, margin) {
    const m = typeof margin === "number" ? margin : 0;
    return rect.bottom >= -m && rect.top <= window.innerHeight + m && rect.right >= -m && rect.left <= window.innerWidth + m;
  }

  function isElementVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.getAttribute && el.getAttribute("data-warpy-ui") === "true") return false;
    if (el.closest && el.closest(`#${WIDGET_CONTAINER_ID}`)) return false;
    const style = getComputedStyle(el);
    if (!style || style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) return false;
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return false;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    return true;
  }

  function isElementConnected(el) {
    return !!(el && el.nodeType === 1 && el.isConnected);
  }

  function getNumericZIndex(el) {
    if (!el || el.nodeType !== 1) return 0;
    const value = parseInt((getComputedStyle(el).zIndex || "0").trim(), 10);
    return Number.isFinite(value) ? value : 0;
  }

  function getElementArea(el) {
    if (!el || el.nodeType !== 1) return 0;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return 0;
    return rect.width * rect.height;
  }

  function hasVisibleInteractiveDescendant(el) {
    if (!isElementConnected(el)) return false;
    const first = el.querySelector(INTERACTIVE_SELECTOR);
    if (!first) return false;
    if (isElementVisible(first)) return true;
    const sample = Array.from(el.querySelectorAll(INTERACTIVE_SELECTOR)).slice(0, 8);
    return sample.some((node) => isElementVisible(node));
  }

  function isLikelyTransientContainer(el) {
    if (!isElementConnected(el) || !isElementVisible(el)) return false;
    if (el.closest && el.closest(`#${WIDGET_CONTAINER_ID}`)) return false;
    const role = normalizeText(el.getAttribute ? el.getAttribute("role") || "" : "");
    const style = getComputedStyle(el);
    const position = style ? style.position : "";
    const area = getElementArea(el);
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const areaRatio = area / viewportArea;
    const z = getNumericZIndex(el);
    const isOverlayRole = role === "menu" || role === "listbox" || role === "dialog" || role === "tree" || role === "grid" || role === "tooltip";
    const hasOverlayAttrs = Boolean(
      (el.getAttribute && el.getAttribute("aria-modal") === "true") ||
      (el.getAttribute && el.getAttribute("aria-live")) ||
      (el.getAttribute && el.getAttribute("popover") !== null) ||
      (el.getAttribute && el.getAttribute("open") !== null)
    );
    const positionedLayer = position === "fixed" || position === "absolute" || position === "sticky";
    if (!isOverlayRole && !hasOverlayAttrs && !positionedLayer) return false;
    if (areaRatio > 0.98 && role !== "dialog") return false;
    if (z < 1 && !hasOverlayAttrs && !isOverlayRole && !positionedLayer) return false;
    return hasVisibleInteractiveDescendant(el);
  }

  function collectVisibleOverlayRoots(limit) {
    const nodes = Array.from(document.querySelectorAll(OVERLAY_ROOT_SELECTOR));
    const sorted = nodes
      .filter((node) => isLikelyTransientContainer(node))
      .sort((a, b) => getNumericZIndex(b) - getNumericZIndex(a) || getElementArea(a) - getElementArea(b));
    if (typeof limit === "number" && limit > 0) {
      return sorted.slice(0, limit);
    }
    return sorted;
  }

  function getClosestOverlayRoot(el) {
    if (!el || el.nodeType !== 1 || !el.closest) return null;
    return el.closest(OVERLAY_ROOT_SELECTOR);
  }

  function getTransientRoot() {
    const root = actionRuntimeState.transientRoot;
    if (!isElementConnected(root) || !isElementVisible(root)) {
      actionRuntimeState.transientRoot = null;
      return null;
    }
    return root;
  }

  function setTransientRoot(root) {
    if (isElementConnected(root) && isElementVisible(root)) {
      actionRuntimeState.transientRoot = root;
      return;
    }
    actionRuntimeState.transientRoot = null;
  }

  function clearTransientRootIfStale() {
    if (!getTransientRoot()) {
      actionRuntimeState.transientRoot = null;
    }
  }

  function getAriaLabel(el) {
    if (!el || !el.getAttribute) return "";
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/).filter(Boolean);
      const parts = ids
        .map((id) => {
          const target = document.getElementById(id);
          return target ? target.innerText || target.textContent || "" : "";
        })
        .filter(Boolean);
      if (parts.length) return parts.join(" ").trim();
    }
    return "";
  }

  function getAssociatedLabelText(el) {
    if (!el) return "";
    const aria = getAriaLabel(el);
    if (aria) return aria;
    if (el.id) {
      const label = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (label) return (label.innerText || label.textContent || "").trim();
    }
    const wrapping = el.closest && el.closest("label");
    if (wrapping) return (wrapping.innerText || wrapping.textContent || "").trim();
    return "";
  }

  function getElementText(el) {
    if (!el) return "";
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "select" || tag === "textarea") return "";
    return (el.innerText || el.textContent || "").trim();
  }

  function isElementDisabled(el) {
    if (!el || el.nodeType !== 1) return true;
    if (Boolean(el.disabled)) return true;
    if (!el.getAttribute) return false;
    if (el.hasAttribute("disabled")) return true;
    return el.getAttribute("aria-disabled") === "true";
  }

  function isPotentialClickTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (["button", "a", "input", "select", "textarea", "summary", "option"].includes(tag)) return true;
    const role = normalizeText(el.getAttribute ? el.getAttribute("role") || "" : "");
    if (CLICKABLE_ROLE_SET.has(role)) return true;
    if (typeof el.onclick === "function" || (el.getAttribute && el.getAttribute("onclick"))) return true;
    const tabIndex = el.getAttribute ? el.getAttribute("tabindex") : null;
    if (tabIndex !== null && Number(tabIndex) >= 0) return true;
    const ariaHasPopup = el.getAttribute ? el.getAttribute("aria-haspopup") : null;
    if (ariaHasPopup && ariaHasPopup !== "false") return true;
    const style = getComputedStyle(el);
    if (style && style.cursor === "pointer") return true;
    const meta = normalizeText(
      [
        String(el.className || ""),
        el.id || "",
        el.getAttribute ? el.getAttribute("data-testid") || "" : "",
        el.getAttribute ? el.getAttribute("data-test") || "" : "",
        el.getAttribute ? el.getAttribute("data-cy") || "" : "",
        el.getAttribute ? el.getAttribute("name") || "" : "",
      ].join(" ")
    );
    return (
      meta.includes("button") ||
      meta.includes("menu") ||
      meta.includes("dropdown") ||
      meta.includes("option") ||
      meta.includes("item") ||
      meta.includes("add")
    );
  }

  function findClickableAncestor(el, maxDepth) {
    let current = el;
    let depth = 0;
    const limit = typeof maxDepth === "number" ? maxDepth : 6;
    while (current && current.nodeType === 1 && depth <= limit) {
      if (isElementVisible(current) && !isElementDisabled(current) && isPotentialClickTarget(current)) {
        return current;
      }
      current = current.parentElement;
      depth += 1;
    }
    return null;
  }

  function scoreTextMatch(haystack, target) {
    if (!haystack || !target) return -1;
    if (haystack === target) return 140;
    if (haystack.startsWith(target)) return 120 - Math.max(0, haystack.length - target.length);
    if (haystack.includes(target)) return 90 - Math.max(0, haystack.length - target.length);
    return -1;
  }

  function chooseBestTextMatch(elements, target, allowAncestor) {
    let best = null;
    let bestScore = -Infinity;
    let inspected = 0;
    for (const el of elements) {
      inspected += 1;
      if (inspected > 1600) break;
      if (!isElementVisible(el)) continue;
      const label = normalizeText(getAssociatedLabelText(el));
      const content = normalizeText(getElementText(el));
      const aria = normalizeText(getAriaLabel(el));
      const haystack = [label, content, aria].filter(Boolean).join(" ");
      const baseScore = scoreTextMatch(haystack, target);
      if (baseScore < 0) continue;
      const resolved = allowAncestor ? findClickableAncestor(el) || el : el;
      if (!resolved || !isElementVisible(resolved) || isElementDisabled(resolved)) continue;
      const role = normalizeText(resolved.getAttribute ? resolved.getAttribute("role") || "" : "");
      const tag = resolved.tagName ? resolved.tagName.toLowerCase() : "";
      let score = baseScore;
      if (resolved === el) score += 10;
      if (role === "menuitem" || role === "option") score += 16;
      if (tag === "button" || tag === "a") score += 12;
      if (isPotentialClickTarget(resolved)) score += 6;
      const rect = resolved.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const area = rect.width * rect.height;
        if (area <= 64000) score += 4;
      }
      if (score > bestScore) {
        bestScore = score;
        best = resolved;
      }
    }
    return best;
  }

  function getSelectOptions(el) {
    if (!el || !el.tagName || el.tagName.toLowerCase() !== "select") return [];
    const options = Array.from(el.options || []);
    if (options.length > 30) return [];
    return options.map((option) => ({
      value: String(option.value),
      text: truncateText(option.textContent || "", 80),
      selected: option.selected,
    }));
  }

  function buildPathSelector(el) {
    const parts = [];
    let current = el;
    while (current && current.nodeType === 1 && parts.length < 4) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        parts.unshift(`${tag}:nth-of-type(${index})`);
      } else {
        parts.unshift(tag);
      }
      current = parent;
      if (current === document.body || current === document.documentElement) {
        break;
      }
    }
    return parts.join(" > ");
  }

  function getSelectorCandidates(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    const candidates = [];
    const push = (value) => {
      if (value && !candidates.includes(value)) {
        candidates.push(value);
      }
    };
    const attrs = ["data-testid", "data-test", "data-qa", "data-cy", "data-test-id"];
    for (const attr of attrs) {
      const value = el.getAttribute && el.getAttribute(attr);
      if (value) {
        push(`[${attr}="${cssEscape(value)}"]`);
      }
    }
    if (el.id) push(`#${cssEscape(el.id)}`);
    if (el.name) push(`${tag}[name="${cssEscape(el.name)}"]`);
    const ariaLabel = el.getAttribute && el.getAttribute("aria-label");
    if (ariaLabel) push(`${tag}[aria-label="${cssEscape(ariaLabel)}"]`);
    const placeholder = el.getAttribute && el.getAttribute("placeholder");
    if (placeholder) push(`${tag}[placeholder="${cssEscape(placeholder)}"]`);
    const role = el.getAttribute && el.getAttribute("role");
    if (role) push(`${tag}[role="${cssEscape(role)}"]`);
    const path = buildPathSelector(el);
    if (path) push(path);
    return candidates;
  }

  function getCheckedState(el) {
    if (typeof el.checked === "boolean") return el.checked;
    if (!el.getAttribute) return null;
    const ariaChecked = el.getAttribute("aria-checked");
    if (ariaChecked === "true") return true;
    if (ariaChecked === "false") return false;
    return null;
  }

  function getElementDescriptor(el, includeRect) {
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    const rect = el.getBoundingClientRect();
    const type = tag === "input" ? (el.getAttribute("type") || el.type || "") : "";
    const role = el.getAttribute ? el.getAttribute("role") || "" : "";
    const label = truncateText(getAssociatedLabelText(el), 120);
    const text = truncateText(getElementText(el), 160);
    const ariaLabel = truncateText(getAriaLabel(el), 120);
    const placeholder = truncateText(el.getAttribute ? el.getAttribute("placeholder") || "" : "", 120);
    const name = el.getAttribute ? el.getAttribute("name") || "" : "";
    const id = el.id || "";
    const disabled = Boolean(el.disabled) || (el.getAttribute && el.getAttribute("aria-disabled") === "true");
    const required = Boolean(el.required);
    const checked = getCheckedState(el);
    const selectors = getSelectorCandidates(el);
    const descriptor = {
      selector: selectors[0] || "",
      selectors,
      tag,
      role,
      type,
      text,
      label,
      ariaLabel,
      placeholder,
      name,
      id,
      disabled,
      required,
      checked,
    };
    if (tag === "select") {
      descriptor.value = el.value;
      const options = getSelectOptions(el);
      if (options.length) {
        descriptor.options = options;
      }
    }
    if (includeRect) {
      descriptor.rect = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      descriptor.inViewport = isRectInViewport(rect, 80);
    }
    return descriptor;
  }

  function tokenizeGoal(goal, selectorHints) {
    const raw = [goal, ...(Array.isArray(selectorHints) ? selectorHints : [])].filter(Boolean).join(" ");
    const tokens = normalizeText(raw).split(" ").filter((token) => token.length > 1);
    return Array.from(new Set(tokens)).slice(0, 12);
  }

  function scoreText(haystack, tokens) {
    if (!tokens.length) return 0;
    let score = 0;
    const words = haystack.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      // Exact match gets full score
      if (haystack.includes(token)) {
        score += 1;
        continue;
      }
      // Fuzzy match: check if any word is within 2 edit distance
      for (const word of words) {
        if (word.length >= 3 && token.length >= 3) {
          const distance = levenshteinDistance(word, token);
          if (distance <= 2) {
            score += 0.7; // Partial score for fuzzy match
            break;
          }
        }
      }
    }
    return score;
  }

  const SCOPE_SELECTORS = {
    modal: '[role="dialog"], [aria-modal="true"], .modal, .dialog',
    dialog: '[role="dialog"], [aria-modal="true"], .modal, .dialog',
    header: "header",
    footer: "footer",
    nav: "nav",
    navigation: "nav",
    main: "main",
  };

  function resolveScopeRoot(scope) {
    if (!scope) return document;
    const trimmed = String(scope).trim();
    if (!trimmed) return document;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("text=") || lower.startsWith("label=") || lower.startsWith("role=")) {
      const target = resolveSelectorTarget(trimmed, document, { allowGlobalFallback: true });
      if (target) return target;
    }
    const scopeSelector = SCOPE_SELECTORS[lower];
    if (scopeSelector) {
      const el = document.querySelector(scopeSelector);
      if (el) return el;
    }
    return safeQuerySelector(document, trimmed) || document;
  }

  function collectHeadings(root) {
    return Array.from(root.querySelectorAll("h1, h2, h3, h4"))
      .filter(isElementVisible)
      .slice(0, 12)
      .map((el) => ({
        level: el.tagName.toLowerCase(),
        text: truncateText(el.innerText || el.textContent || "", 120),
      }))
      .filter((item) => item.text);
  }

  function resolveSelectorTarget(selector, root, options) {
    if (!selector) return null;
    const trimmed = String(selector).trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    const base = root || document;
    if (lower.startsWith("text=")) {
      return findElementByText(trimmed.slice(5), base, options);
    }
    if (lower.startsWith("label=")) {
      return findElementByLabel(trimmed.slice(6), base);
    }
    if (lower.startsWith("role=")) {
      return findElementByRole(trimmed.slice(5), base);
    }
    return safeQuerySelector(base, trimmed);
  }

  // Collect elements including shadow DOM traversal
  function collectAllInteractiveElements(root, selector) {
    const elements = Array.from(root.querySelectorAll(selector));
    // Traverse shadow roots
    const allElements = root.querySelectorAll("*");
    for (const el of allElements) {
      if (el.shadowRoot) {
        try {
          elements.push(...collectAllInteractiveElements(el.shadowRoot, selector));
        } catch {
          // Shadow root may be closed, skip
        }
      }
    }
    return elements;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Accessibility Tree Builder & Find Engine
  // ═══════════════════════════════════════════════════════════════════════════

  const IMPLICIT_ROLES = {
    button: "button", a: "link", input: "textbox", select: "combobox",
    textarea: "textbox", nav: "navigation", main: "main", header: "banner",
    footer: "contentinfo", aside: "complementary", h1: "heading", h2: "heading",
    h3: "heading", h4: "heading", h5: "heading", h6: "heading",
    dialog: "dialog", table: "table", tr: "row", td: "cell", th: "columnheader",
    ul: "list", ol: "list", li: "listitem", img: "img", form: "form",
    section: "region", article: "article", summary: "button", details: "group",
    option: "option", fieldset: "group", legend: "legend",
  };

  const SEMANTIC_ROLES = new Set([
    "button", "link", "textbox", "combobox", "checkbox", "radio", "switch",
    "slider", "tab", "tablist", "tabpanel", "menu", "menuitem",
    "menuitemcheckbox", "menuitemradio", "option", "listbox", "tree",
    "treeitem", "grid", "row", "cell", "dialog", "alertdialog", "alert",
    "status", "tooltip", "heading", "navigation", "main", "banner",
    "contentinfo", "complementary", "region", "article", "form", "search",
    "list", "listitem", "img", "table", "columnheader", "group", "legend",
  ]);

  function getImplicitRole(el) {
    const explicit = el.getAttribute && el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "submit" || type === "button" || type === "reset") return "button";
      if (type === "search") return "searchbox";
      return "textbox";
    }
    return IMPLICIT_ROLES[tag] || "";
  }

  function getAccessibleName(el) {
    const ariaLabel = getAriaLabel(el);
    if (ariaLabel) return truncateText(ariaLabel, 60);
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "select" || tag === "textarea") {
      const label = getAssociatedLabelText(el);
      if (label) return truncateText(label, 60);
      const placeholder = el.getAttribute && el.getAttribute("placeholder");
      if (placeholder) return truncateText(placeholder, 60);
      return "";
    }
    if (tag === "img") {
      const alt = el.getAttribute && el.getAttribute("alt");
      if (alt) return truncateText(alt, 60);
      return "";
    }
    const text = getElementText(el);
    if (text && text.length <= 60) return text;
    if (text) return truncateText(text, 60);
    const title = el.getAttribute && el.getAttribute("title");
    if (title) return truncateText(title, 60);
    return "";
  }

  function getElementStates(el) {
    const states = [];
    if (isElementDisabled(el)) states.push("disabled");
    const checked = getCheckedState(el);
    if (checked === true) states.push("checked");
    const role = getImplicitRole(el);
    if (checked === false && (role === "checkbox" || role === "radio" || role === "switch")) {
      states.push("unchecked");
    }
    if (el.required) states.push("required");
    const expanded = el.getAttribute && el.getAttribute("aria-expanded");
    if (expanded === "true") states.push("expanded");
    if (expanded === "false") states.push("collapsed");
    if (el.getAttribute && el.getAttribute("aria-selected") === "true") states.push("selected");
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (el.value && (tag === "input" || tag === "textarea" || tag === "select")) {
      states.push("value=\"" + truncateText(String(el.value), 30) + "\"");
    }
    return states;
  }

  function isSemanticNode(el, role, filterMode) {
    if (filterMode === "interactive") {
      return el.matches && el.matches(INTERACTIVE_SELECTOR);
    }
    if (SEMANTIC_ROLES.has(role)) return true;
    if (getAccessibleName(el)) return true;
    return false;
  }

  function buildAccessibilityTree(options) {
    const depth = clampInt(options && options.depth || 15, 1, 30);
    const filterMode = options && options.filter === "interactive" ? "interactive" : "all";
    const maxChars = clampInt(options && options.maxChars || 50000, 5000, 80000);
    let startNode = document.body;
    if (options && options.refId) {
      const scoped = refMap.resolve(options.refId);
      if (scoped) startNode = scoped;
    }

    const lines = [];
    let charCount = 0;
    let truncated = false;

    function walk(el, currentDepth, indent) {
      if (truncated) return;
      if (currentDepth > depth) return;
      if (!el || el.nodeType !== 1) return;
      if (!isElementConnected(el)) return;
      if (el.getAttribute && el.getAttribute("data-warpy-ui") === "true") return;
      if (el.closest && el.closest("#" + WIDGET_CONTAINER_ID)) return;
      const style = getComputedStyle(el);
      if (!style || style.display === "none" || style.visibility === "hidden") return;
      if (el !== document.body && (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true")) return;

      const role = getImplicitRole(el);
      const interesting = isSemanticNode(el, role, filterMode);

      if (interesting) {
        const ref = refMap.assign(el);
        const name = getAccessibleName(el);
        const states = getElementStates(el);

        let line = indent + "[" + ref + "] " + (role || el.tagName.toLowerCase());
        if (name) line += " \"" + name + "\"";
        if (states.length) line += " (" + states.join(", ") + ")";
        line += "\n";

        if (charCount + line.length > maxChars) {
          lines.push(indent + "... (truncated)\n");
          truncated = true;
          return;
        }
        charCount += line.length;
        lines.push(line);
      }

      const children = el.children;
      if (!children) return;
      const childIndent = interesting ? indent + "  " : indent;
      const childDepth = interesting ? currentDepth + 1 : currentDepth;
      for (let i = 0; i < children.length; i++) {
        if (truncated) break;
        walk(children[i], childDepth, childIndent);
      }
    }

    walk(startNode, 0, "");
    return {
      kind: "read_page",
      tree: lines.join(""),
      truncated,
      url: window.location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }

  function findElements(query, maxResults) {
    const limit = clampInt(maxResults || 20, 1, 20);
    const target = normalizeText(query);
    if (!target) return { kind: "find_elements", query: query, matches: [] };

    const tokens = target.split(/\s+/).filter(function (t) { return t.length > 1; });
    const candidates = [];
    const allElements = document.querySelectorAll("*");
    let inspected = 0;

    for (const el of allElements) {
      if (++inspected > 5000) break;
      if (!isElementVisible(el)) continue;
      if (el.closest && el.closest("#" + WIDGET_CONTAINER_ID)) continue;

      const role = getImplicitRole(el);
      const name = getAccessibleName(el);
      if (!name && !SEMANTIC_ROLES.has(role)) continue;

      const haystack = normalizeText([
        name,
        getAssociatedLabelText(el),
        el.getAttribute && el.getAttribute("placeholder") || "",
        el.id || "",
        role,
      ].join(" "));

      const score = scoreText(haystack, tokens);
      if (score <= 0) continue;

      candidates.push({ el: el, score: score, role: role, name: name });
    }

    candidates.sort(function (a, b) { return b.score - a.score; });
    var results = candidates.slice(0, limit);

    return {
      kind: "find_elements",
      query: query,
      matches: results.map(function (item) {
        var ref = refMap.assign(item.el);
        var states = getElementStates(item.el);
        var match = { ref: ref, role: item.role, name: item.name };
        if (states.length) match.states = states;
        return match;
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Element Highlight Overlay
  // ═══════════════════════════════════════════════════════════════════════════

  let highlightEl = null;
  let highlightTimer = null;

  function clearHighlight() {
    if (!highlightEl) return;
    highlightEl.style.opacity = "0";
  }

  function highlightElement(el) {
    if (!el || !document.body) return;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    if (!highlightEl) {
      highlightEl = document.createElement("div");
      highlightEl.setAttribute("data-warpy-ui", "true");
      highlightEl.style.position = "fixed";
      highlightEl.style.pointerEvents = "none";
      highlightEl.style.zIndex = "2147482999";
      highlightEl.style.borderRadius = "10px";
      highlightEl.style.transition = "opacity 160ms ease, transform 160ms ease";
      highlightEl.style.opacity = "0";
      document.body.appendChild(highlightEl);
    }
    const themeAccent =
      parseColor(getComputedStyle(document.getElementById(WIDGET_CONTAINER_ID) || document.body).getPropertyValue("--cta-accent")) ||
      { r: 37, g: 99, b: 235, a: 1 };
    const accent = themeAccent;
    highlightEl.style.border = `2px solid ${rgbCss(accent)}`;
    highlightEl.style.background = rgbaCss(accent, 0.08);
    highlightEl.style.boxShadow = `0 0 0 4px ${rgbaCss(accent, 0.2)}`;
    highlightEl.style.left = `${Math.max(0, Math.round(rect.left - 6))}px`;
    highlightEl.style.top = `${Math.max(0, Math.round(rect.top - 6))}px`;
    highlightEl.style.width = `${Math.round(rect.width + 12)}px`;
    highlightEl.style.height = `${Math.round(rect.height + 12)}px`;
    highlightEl.style.opacity = "1";
    highlightEl.style.transform = "scale(1)";
    if (highlightTimer) {
      clearTimeout(highlightTimer);
    }
    highlightTimer = setTimeout(() => {
      clearHighlight();
    }, 900);
  }

  function findElementByText(text, root, options) {
    const target = normalizeText(text);
    if (!target) return null;
    const base = root || document;
    const allowGlobalFallback = !options || options.allowGlobalFallback !== false;
    const roots = base === document || !allowGlobalFallback ? [base] : [base, document];
    for (const lookupRoot of roots) {
      const interactive = Array.from(lookupRoot.querySelectorAll(INTERACTIVE_SELECTOR));
      const direct = chooseBestTextMatch(interactive, target, false);
      if (direct) return direct;
      const fallbackCandidates = Array.from(lookupRoot.querySelectorAll(TEXT_FALLBACK_SELECTOR)).slice(0, 2400);
      const fallback = chooseBestTextMatch(fallbackCandidates, target, true);
      if (fallback) return fallback;
      const isScopedOverlayRoot =
        lookupRoot !== document &&
        lookupRoot.nodeType === 1 &&
        ((lookupRoot.matches && lookupRoot.matches(OVERLAY_ROOT_SELECTOR)) || isLikelyTransientContainer(lookupRoot));
      if (isScopedOverlayRoot) {
        const universalCandidates = Array.from(lookupRoot.querySelectorAll("*")).slice(0, 500);
        const universal = chooseBestTextMatch(universalCandidates, target, true);
        if (universal) return universal;
      }
    }
    return null;
  }

  function findElementByLabel(text, root) {
    const target = normalizeText(text);
    if (!target) return null;
    const base = root || document;
    const labels = Array.from(base.querySelectorAll("label"));
    for (const label of labels) {
      if (!isElementVisible(label)) continue;
      const labelText = normalizeText(label.innerText || label.textContent || "");
      if (!labelText) continue;
      if (labelText === target || labelText.includes(target)) {
        const forId = label.getAttribute("for");
        if (forId) {
          const input = document.getElementById(forId);
          if (input) return input;
        }
        const input = label.querySelector("input, select, textarea, button");
        if (input) return input;
      }
    }
    return null;
  }

  function findElementByRole(role, root) {
    const target = normalizeText(role);
    if (!target) return null;
    const base = root || document;
    const matches = Array.from(base.querySelectorAll(`[role="${cssEscape(target)}"]`));
    const visible = matches.find((el) => isElementVisible(el));
    return visible || matches[0] || null;
  }

  async function waitForElement(selector, options, signal) {
    const timeoutMs = clampInt(options && options.timeoutMs ? options.timeoutMs : 8000, 400, 20000);
    const requireVisible = options && options.visible !== false;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      throwIfAborted(signal);
      const el = resolveSelectorTarget(selector, document);
      if (el && (!requireVisible || isElementVisible(el))) {
        return el;
      }
      await sleep(200, signal);
    }
    return null;
  }

  function normalizeSelectorValue(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function normalizeUniqueStringList(values, maxItems) {
    const input = Array.isArray(values) ? values : [];
    const seen = new Set();
    const normalized = [];
    for (const value of input) {
      const item = normalizeSelectorValue(value);
      if (!item || seen.has(item)) continue;
      seen.add(item);
      normalized.push(item);
      if (normalized.length >= maxItems) break;
    }
    return normalized;
  }

  function pushUniqueSelector(selectors, value) {
    const normalized = normalizeSelectorValue(value);
    if (!normalized) return;
    if (!selectors.includes(normalized)) {
      selectors.push(normalized);
    }
  }

  function pushUniqueRoot(roots, root) {
    if (!isElementConnected(root) || !isElementVisible(root)) return;
    if (!roots.includes(root)) {
      roots.push(root);
    }
  }

  function getActionSelectorCandidates(action) {
    const selectors = [];
    pushUniqueSelector(selectors, action.selector || action.target || "");
    const alternatives = Array.isArray(action.selectorAlternatives)
      ? action.selectorAlternatives
      : Array.isArray(action.selector_alternatives)
      ? action.selector_alternatives
      : [];
    for (const alt of alternatives) {
      pushUniqueSelector(selectors, alt);
    }
    if (action.text !== null && action.text !== undefined) {
      pushUniqueSelector(selectors, `text=${String(action.text)}`);
    }
    if (action.role) {
      pushUniqueSelector(selectors, `role=${String(action.role)}`);
    }
    return selectors;
  }

  function getActionScopeCandidates(action) {
    const scopes = [];
    pushUniqueSelector(scopes, action.scope || action.contextScope || "");
    const alternatives = Array.isArray(action.scopeAlternatives)
      ? action.scopeAlternatives
      : Array.isArray(action.scope_alternatives)
      ? action.scope_alternatives
      : [];
    for (const alt of alternatives) {
      pushUniqueSelector(scopes, alt);
    }
    return scopes;
  }

  function hasTextShortcutSelector(selectors) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    return list.some((selector) => normalizeSelectorValue(selector).toLowerCase().startsWith("text="));
  }

  function resolveFirstSelectorTarget(selectors, root, options) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    const base = root || document;
    const allowGlobalFallback = !options || options.allowGlobalFallback !== false;
    for (const selector of list) {
      const normalized = normalizeSelectorValue(selector);
      if (!normalized) continue;
      const element = resolveSelectorTarget(normalized, base, { allowGlobalFallback });
      if (element) {
        return { element, selector: normalized };
      }
    }
    return null;
  }

  function resolveSelectorAcrossRoots(selectors, roots, options) {
    const useDocumentFallback = !options || options.useDocumentFallback !== false;
    const list = Array.isArray(roots) && roots.length ? roots : useDocumentFallback ? [document] : [];
    for (const root of list) {
      const allowGlobalFallback = root === document;
      const match = resolveFirstSelectorTarget(selectors, root, { allowGlobalFallback });
      if (match) {
        return match;
      }
    }
    return null;
  }

  function getActionSearchRoots(action, selectors, options) {
    const includeDocument = !options || options.includeDocument !== false;
    const allowDocumentFallbackWhenEmpty = !options || options.allowDocumentFallbackWhenEmpty !== false;
    const roots = [];
    const scopeCandidates = getActionScopeCandidates(action);
    for (const scope of scopeCandidates) {
      const scopeRoot = resolveScopeRoot(scope);
      if (scopeRoot && scopeRoot !== document) {
        pushUniqueRoot(roots, scopeRoot);
      }
    }
    const transientRoot = getTransientRoot();
    if (transientRoot) {
      pushUniqueRoot(roots, transientRoot);
    }
    const overlays = collectVisibleOverlayRoots(6);
    for (const overlay of overlays) {
      pushUniqueRoot(roots, overlay);
    }
    const shouldConstrainToTransientRoot = !!(transientRoot && hasTextShortcutSelector(selectors));
    const shouldIncludeDocument = includeDocument && !shouldConstrainToTransientRoot;
    if (shouldIncludeDocument) {
      roots.push(document);
    }
    if (!roots.length && includeDocument && allowDocumentFallbackWhenEmpty) {
      roots.push(document);
    }
    return roots;
  }

  async function waitForAnyElement(selectors, options, signal) {
    const list = Array.isArray(selectors) ? selectors.map(normalizeSelectorValue).filter(Boolean) : [normalizeSelectorValue(selectors)].filter(Boolean);
    if (!list.length) return null;
    const timeoutMs = clampInt(options && options.timeoutMs ? options.timeoutMs : 8000, 400, 20000);
    const requireVisible = options && options.visible !== false;
    const getRoots = options && typeof options.getRoots === "function" ? options.getRoots : () => (Array.isArray(options && options.roots) && options.roots.length ? options.roots : [document]);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      throwIfAborted(signal);
      const roots = getRoots();
      for (const root of roots) {
        const allowGlobalFallback = root === document;
        const match = resolveFirstSelectorTarget(list, root, { allowGlobalFallback });
        if (match && (!requireVisible || isElementVisible(match.element))) {
          return match;
        }
      }
      await sleep(200, signal);
    }
    return null;
  }

  function extractTextShortcutValue(selectors, action) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of list) {
      const normalized = normalizeSelectorValue(selector);
      if (normalized.toLowerCase().startsWith("text=")) {
        const value = normalized.slice(5).trim();
        if (value) return value;
      }
    }
    if (action && action.text !== null && action.text !== undefined) {
      const text = String(action.text).trim();
      if (text) return text;
    }
    return "";
  }

  function performSyntheticClick(target, action) {
    const point = getActionPoint(target, action || {});
    dispatchPointerEvent(target, "pointerdown", point);
    dispatchMouseEvent(target, "mousedown", point);
    focusElement(target);
    dispatchPointerEvent(target, "pointerup", point);
    dispatchMouseEvent(target, "mouseup", point);
    dispatchMouseEvent(target, "click", point);
  }

  function isLikelyMenuOpener(el) {
    if (!isElementConnected(el) || !isElementVisible(el) || isElementDisabled(el)) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    const role = normalizeText(el.getAttribute ? el.getAttribute("role") || "" : "");
    const text = normalizeText(getElementText(el));
    const label = normalizeText(getAssociatedLabelText(el));
    const aria = normalizeText(getAriaLabel(el));
    const attrs = normalizeText(
      [
        String(el.className || ""),
        el.id || "",
        el.getAttribute ? el.getAttribute("name") || "" : "",
        el.getAttribute ? el.getAttribute("data-testid") || "" : "",
      ].join(" ")
    );
    if (el.getAttribute && el.getAttribute("aria-haspopup")) return true;
    if (el.getAttribute && el.getAttribute("aria-expanded") !== null) return true;
    if (tag === "button" || role === "button") {
      const openerWords = ["add", "new", "create", "open", "menu", "options", "more", "plus", "toggle", "choose", "select", "insert", "+"];
      const haystack = [text, label, aria, attrs].filter(Boolean).join(" ");
      return openerWords.some((word) => haystack.includes(word));
    }
    return false;
  }

  function distancePointToRect(point, rect) {
    const dx = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0;
    const dy = point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pickBestOverlayRootForClick(overlays, point) {
    if (!Array.isArray(overlays) || !overlays.length) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const overlay of overlays) {
      if (!isElementVisible(overlay)) continue;
      const rect = overlay.getBoundingClientRect();
      const distance = rect ? distancePointToRect(point, rect) : 10000;
      const z = getNumericZIndex(overlay);
      const area = getElementArea(overlay);
      const score = z * 1000 - distance - Math.min(area, 120000) * 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = overlay;
      }
    }
    return best;
  }

  async function performClickAndTrackTransientRoot(target, action, signal) {
    const point = getActionPoint(target, action || {});
    const shouldTrack = isLikelyMenuOpener(target);
    const before = shouldTrack ? collectVisibleOverlayRoots(10) : [];
    performSyntheticClick(target, action);
    if (!shouldTrack) {
      clearTransientRootIfStale();
      return;
    }
    const maxWaitMs = 300;
    const pollIntervalMs = 50;
    let waited = 0;
    let candidate = null;
    while (waited < maxWaitMs && !candidate) {
      await sleep(pollIntervalMs, signal);
      waited += pollIntervalMs;
      const after = collectVisibleOverlayRoots(10);
      candidate = after.find((overlay) => !before.includes(overlay));
    }
    if (!candidate) {
      const after = collectVisibleOverlayRoots(10);
      candidate = pickBestOverlayRootForClick(after, point);
    }
    setTransientRoot(candidate || null);
  }

  function scoreMenuTrigger(el, textTarget) {
    if (!isElementVisible(el) || isElementDisabled(el)) return -1;
    const role = normalizeText(el.getAttribute ? el.getAttribute("role") || "" : "");
    const text = normalizeText(getElementText(el));
    const label = normalizeText(getAssociatedLabelText(el));
    const aria = normalizeText(getAriaLabel(el));
    const attrs = normalizeText(
      [
        String(el.className || ""),
        el.id || "",
        el.getAttribute ? el.getAttribute("name") || "" : "",
        el.getAttribute ? el.getAttribute("data-testid") || "" : "",
        el.getAttribute ? el.getAttribute("data-test") || "" : "",
        el.getAttribute ? el.getAttribute("data-cy") || "" : "",
      ].join(" ")
    );
    const haystack = [text, label, aria, attrs].filter(Boolean).join(" ");
    let score = 0;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "button") score += 10;
    if (role === "button") score += 8;
    const hasPopup = el.getAttribute ? el.getAttribute("aria-haspopup") : "";
    if (hasPopup && hasPopup !== "false") score += 12;
    if (el.getAttribute && el.getAttribute("aria-expanded") !== null) score += 4;
    const triggerWords = ["add", "new", "create", "open", "menu", "options", "more", "plus", "toggle", "choose", "select", "insert", "+"];
    for (const word of triggerWords) {
      if (haystack.includes(word)) score += 3;
    }
    if (text === "+" || aria === "+" || label === "+") score += 12;
    if (textTarget) {
      const target = normalizeText(textTarget);
      if (target && haystack.includes(target)) {
        score -= 12;
      }
    }
    if (!isPotentialClickTarget(el)) score -= 8;
    return score;
  }

  function findMenuTriggerCandidates(textTarget) {
    const nodes = Array.from(document.querySelectorAll(MENU_TRIGGER_SELECTOR));
    const scored = [];
    for (const node of nodes) {
      const score = scoreMenuTrigger(node, textTarget);
      if (score > 0) {
        scored.push({ node, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const unique = [];
    const seen = new Set();
    for (const item of scored) {
      if (seen.has(item.node)) continue;
      seen.add(item.node);
      unique.push(item.node);
      if (unique.length >= 4) break;
    }
    return unique;
  }

  async function attemptRevealAndResolveActionTarget(action, selectors, signal) {
    const textTarget = extractTextShortcutValue(selectors, action);
    if (!textTarget) return null;
    const triggers = findMenuTriggerCandidates(textTarget);
    for (const trigger of triggers) {
      throwIfAborted(signal);
      await performClickAndTrackTransientRoot(trigger, null, signal);
      await sleep(120, signal);
      const match = resolveSelectorAcrossRoots(selectors, getActionSearchRoots(action, selectors, { includeDocument: true }));
      if (match && isElementVisible(match.element) && !isElementDisabled(match.element)) {
        return match;
      }
    }
    return null;
  }

  async function resolveActionTarget(action, signal) {
    if (action.ref) {
      const el = refMap.resolve(action.ref);
      if (el && isElementConnected(el) && isElementVisible(el)) {
        action._resolvedSelector = action.ref;
        return el;
      }
    }
    const selectors = getActionSelectorCandidates(action);
    let match = resolveSelectorAcrossRoots(selectors, getActionSearchRoots(action, selectors, { includeDocument: true }));
    if (!match && selectors.length && action.timeoutMs) {
      match = await waitForAnyElement(
        selectors,
        {
          timeoutMs: action.timeoutMs,
          getRoots: () => getActionSearchRoots(action, selectors, { includeDocument: true }),
        },
        signal
      );
    }
    if (!match && (action.action === "click" || action.action === "tap")) {
      match = await attemptRevealAndResolveActionTarget(action, selectors, signal);
    }
    if (match) {
      action._resolvedSelector = match.selector;
      return match.element;
    }
    return null;
  }

  function getElementTargetContext(el) {
    if (!isElementConnected(el)) return null;
    const overlayRoot = getClosestOverlayRoot(el);
    const role = el.getAttribute ? el.getAttribute("role") || "" : "";
    const text = truncateText(getElementText(el), 80);
    const ariaLabel = truncateText(getAriaLabel(el), 80);
    return {
      tag: el.tagName ? el.tagName.toLowerCase() : "",
      role,
      text,
      ariaLabel,
      inOverlay: Boolean(overlayRoot && isElementVisible(overlayRoot)),
      overlayRole: overlayRoot && overlayRoot.getAttribute ? overlayRoot.getAttribute("role") || "" : "",
    };
  }

  async function waitForText(text, options, signal) {
    const target = normalizeText(text);
    if (!target) return false;
    const timeoutMs = clampInt(options && options.timeoutMs ? options.timeoutMs : 8000, 400, 20000);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      throwIfAborted(signal);
      const bodyText = normalizeText(document.body ? document.body.innerText || document.body.textContent || "" : "");
      if (bodyText.includes(target)) return true;
      await sleep(200, signal);
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Synthetic Event Dispatch & Input Manipulation
  // ═══════════════════════════════════════════════════════════════════════════

  function getActionPoint(el, action) {
    const rect = el.getBoundingClientRect();
    let x = rect.width / 2;
    let y = rect.height / 2;
    if (typeof action.x === "number") {
      x = action.x >= 0 && action.x <= 1 ? rect.width * action.x : action.x;
    }
    if (typeof action.y === "number") {
      y = action.y >= 0 && action.y <= 1 ? rect.height * action.y : action.y;
    }
    return {
      x: Math.round(rect.left + clamp(x, 0, rect.width)),
      y: Math.round(rect.top + clamp(y, 0, rect.height)),
    };
  }

  function dispatchPointerEvent(el, type, point) {
    if (typeof PointerEvent !== "function") {
      dispatchMouseEvent(el, type.replace("pointer", "mouse"), point);
      return;
    }
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: point.x,
      clientY: point.y,
      pointerId: 1,
      pointerType: "mouse",
    });
    el.dispatchEvent(event);
  }

  function dispatchMouseEvent(el, type, point) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: point.x,
      clientY: point.y,
    });
    el.dispatchEvent(event);
  }

  function dispatchKeyboardEvent(el, type, key) {
    const event = new KeyboardEvent(type, {
      key,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(event);
  }

  function setInputValue(el, value) {
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea") {
      const descriptor = Object.getOwnPropertyDescriptor(el.__proto__, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (el.isContentEditable) {
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function setChecked(el, checked) {
    if (typeof el.checked === "boolean") {
      const descriptor = Object.getOwnPropertyDescriptor(el.__proto__, "checked");
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, checked);
      } else {
        el.checked = checked;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (el.getAttribute) {
      el.setAttribute("aria-checked", checked ? "true" : "false");
    }
  }

  function focusElement(el) {
    if (!el || !el.focus) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Action Description & Labeling
  // ═══════════════════════════════════════════════════════════════════════════

  const ACTION_LABELS = {
    click: "Click",
    tap: "Tap",
    double_click: "Double click",
    dblclick: "Double click",
    doubleclick: "Double click",
    right_click: "Right click",
    contextmenu: "Right click",
    hover: "Hover",
    focus: "Focus",
    blur: "Remove focus",
    type: "Type",
    input: "Type",
    set_value: "Type",
    clear: "Clear",
    press: "Press",
    select: "Select",
    check: "Check",
    uncheck: "Uncheck",
    scroll: "Scroll",
    scroll_into_view: "Scroll to",
    scrollintoview: "Scroll to",
    wait: "Wait",
    wait_for: "Wait for",
    waitfor: "Wait for",
    wait_for_text: "Wait for",
    waitfortext: "Wait for",
    wait_for_stable: "Wait for stable",
    waitforstable: "Wait for stable",
    navigate: "Open page",
    drag: "Drag",
    drag_and_drop: "Drag",
    dispatch: "Trigger",
  };

  function normalizeAction(action) {
    if (!action || typeof action !== "object") {
      return { action: "" };
    }
    const name = action.action || action.type || "";
    const rawAlternatives = Array.isArray(action.selectorAlternatives)
      ? action.selectorAlternatives
      : Array.isArray(action.selector_alternatives)
      ? action.selector_alternatives
      : [];
    const rawScopeAlternatives = Array.isArray(action.scopeAlternatives)
      ? action.scopeAlternatives
      : Array.isArray(action.scope_alternatives)
      ? action.scope_alternatives
      : [];
    const selectorAlternatives = normalizeUniqueStringList(rawAlternatives, 3);
    const scopeAlternatives = normalizeUniqueStringList(rawScopeAlternatives, 3);
    const scope = action.scope != null ? String(action.scope).trim() : "";
    return {
      ...action,
      action: String(name).trim().toLowerCase(),
      scope,
      scopeAlternatives,
      selectorAlternatives,
      _resolvedSelector: null,
      _targetContext: null,
    };
  }

  function getActionLabel(name) {
    const normalized = String(name || "").trim().toLowerCase();
    if (ACTION_LABELS[normalized]) return ACTION_LABELS[normalized];
    if (!normalized) return "Action";
    const spaced = normalized.replace(/_/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function extractSelectorLabel(selector) {
    if (!selector) return "";
    const trimmed = String(selector).trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("text=")) return trimmed.slice(5).trim();
    if (lower.startsWith("label=")) return trimmed.slice(6).trim();
    if (lower.startsWith("role=")) return trimmed.slice(5).trim();
    return "";
  }

  function isTechnicalLabel(value) {
    const lower = value.toLowerCase();
    if (lower.startsWith("#") || lower.startsWith(".") || lower.startsWith("http")) return true;
    if (lower.includes("[") || lower.includes("]") || lower.includes("::") || lower.includes("data-") || lower.includes("aria-")) return true;
    if (lower.includes(">") || lower.includes(":nth") || lower.includes("role=")) return true;
    return false;
  }

  function formatActionTarget(action) {
    const selectorLabel = extractSelectorLabel(action.selector || action.target);
    const candidates = [selectorLabel, action.text, action.value]
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).replace(/\s+/g, " ").trim())
      .filter((value) => value);
    for (const candidate of candidates) {
      if (!isTechnicalLabel(candidate)) {
        return truncateText(candidate, 44);
      }
    }
    return "";
  }

  function formatKeyLabel(action) {
    const keys = Array.isArray(action.keys) ? action.keys : action.key ? [action.key] : [];
    const cleaned = keys.map((key) => String(key).trim()).filter(Boolean);
    return cleaned.length ? truncateText(cleaned.join(" + "), 32) : "";
  }

  function describeAction(action) {
    const name = action.action || "";
    const label = getActionLabel(name);
    if (name === "press") {
      const keys = formatKeyLabel(action);
      return keys ? `${label} ${keys}` : label;
    }
    if (name === "wait") {
      return label;
    }
    if (name === "navigate") {
      return label;
    }
    const target = formatActionTarget(action);
    return target ? `${label} ${target}` : label;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Frontend Action Execution
  // ═══════════════════════════════════════════════════════════════════════════

  // Structured error with code and recovery hint
  class ActionError extends Error {
    constructor(message, errorCode, recoveryHint) {
      super(message);
      this.name = "ActionError";
      this.errorCode = errorCode || "UNKNOWN";
      this.recoveryHint = recoveryHint || null;
    }
  }

  function createError(message, errorCode, recoveryHint) {
    return new ActionError(message, errorCode, recoveryHint);
  }

  // MutationObserver-based wait for DOM stability
  async function waitForStable(selector, options, signal) {
    const timeoutMs = clampInt(options && options.timeoutMs ? options.timeoutMs : 5000, 400, 20000);
    const stabilityMs = clampInt(options && options.stabilityMs ? options.stabilityMs : 300, 100, 2000);

    // First wait for element to exist
    const el = selector ? await waitForElement(selector, { timeoutMs }, signal) : document.body;
    if (!el) {
      throw createError("Element not found for stability check", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
    }

    return new Promise((resolve, reject) => {
      let stabilityTimer = null;
      let timeoutTimer = null;
      let observer = null;

      const cleanup = () => {
        if (stabilityTimer) clearTimeout(stabilityTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (observer) observer.disconnect();
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      };

      const onStable = () => {
        cleanup();
        resolve(el);
      };

      const onAbort = () => {
        cleanup();
        reject(createAbortError());
      };

      const resetStabilityTimer = () => {
        if (stabilityTimer) clearTimeout(stabilityTimer);
        stabilityTimer = setTimeout(onStable, stabilityMs);
      };

      observer = new MutationObserver(() => {
        resetStabilityTimer();
      });

      observer.observe(el, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      // Start initial stability timer
      resetStabilityTimer();

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      // Overall timeout
      timeoutTimer = setTimeout(() => {
        cleanup();
        // If we timeout, still resolve - the DOM may be stable enough
        resolve(el);
      }, timeoutMs);
    });
  }

  // Execute action with retry logic
  async function executeWithRetry(actionFn, retryCount, retryDelayMs, signal) {
    let lastError = null;
    const maxAttempts = Math.max(1, (retryCount || 0) + 1);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      throwIfAborted(signal);
      try {
        return await actionFn();
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        lastError = error;
        // Don't retry certain errors
        if (error.errorCode === "SELECTOR_INVALID" || error.errorCode === "ELEMENT_DISABLED") {
          throw error;
        }
        // If not last attempt, wait and retry
        if (attempt < maxAttempts - 1) {
          const delay = (retryDelayMs || 500) * Math.pow(2, attempt); // Exponential backoff
          await sleep(Math.min(delay, 5000), signal);
        }
      }
    }
    throw lastError;
  }

  async function runFrontendAction(action, signal) {
    throwIfAborted(signal);
    const name = action.action;
    if (!name) {
      throw new Error("Missing action");
    }
    clearTransientRootIfStale();
    if (name === "wait") {
      const delay = clampInt(action.delayMs || action.ms || 500, 0, 10000);
      await sleep(delay, signal);
      return;
    }
    if (name === "waitfor" || name === "wait_for") {
      const selectors = getActionSelectorCandidates(action);
      const match = selectors.length
        ? await waitForAnyElement(
            selectors,
            {
              timeoutMs: action.timeoutMs,
              getRoots: () => getActionSearchRoots(action, selectors, { includeDocument: true }),
            },
            signal
          )
        : null;
      if (!match) throw createError("Element not found", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
      action._resolvedSelector = match.selector;
      return;
    }
    if (name === "waitfortext" || name === "wait_for_text") {
      const ok = await waitForText(action.text || action.value || "", { timeoutMs: action.timeoutMs }, signal);
      if (!ok) throw createError("Text not found", "TIMEOUT", "WAIT_AND_RETRY");
      return;
    }
    if (name === "wait_for_stable" || name === "waitforstable") {
      const selectors = getActionSelectorCandidates(action);
      let selector = null;
      if (selectors.length) {
        const match =
          resolveSelectorAcrossRoots(selectors, getActionSearchRoots(action, selectors, { includeDocument: true })) ||
          (action.timeoutMs
            ? await waitForAnyElement(
                selectors,
                {
                  timeoutMs: action.timeoutMs,
                  getRoots: () => getActionSearchRoots(action, selectors, { includeDocument: true }),
                },
                signal
              )
            : null);
        if (!match) throw createError("Element not found for stability check", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
        selector = match.selector;
      }
      await waitForStable(selector, {
        timeoutMs: action.timeoutMs,
        stabilityMs: action.stabilityMs || 300,
      }, signal);
      action._resolvedSelector = selector;
      return;
    }
    if (name === "navigate") {
      const url = action.url || action.value;
      if (!url) throw createError("Missing url", "SELECTOR_INVALID", null);
      actionRuntimeState.transientRoot = null;
      window.location.assign(String(url));
      return;
    }
    if (name === "scroll") {
      const behavior = action.behavior || "auto";
      const x = Number(action.x || 0);
      const y = Number(action.y || action.deltaY || 0);
      const selectors = getActionSelectorCandidates(action);
      if (selectors.length) {
        const match =
          resolveSelectorAcrossRoots(selectors, getActionSearchRoots(action, selectors, { includeDocument: true })) ||
          (action.timeoutMs
            ? await waitForAnyElement(
                selectors,
                {
                  timeoutMs: action.timeoutMs,
                  getRoots: () => getActionSearchRoots(action, selectors, { includeDocument: true }),
                },
                signal
              )
            : null);
        const target = match ? match.element : null;
        if (!target) throw createError("Element not found", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
        action._resolvedSelector = match.selector;
        action._targetContext = getElementTargetContext(target);
        target.scrollBy({ left: x, top: y, behavior });
      } else {
        window.scrollBy({ left: x, top: y, behavior });
      }
      return;
    }
    if (name === "scroll_into_view" || name === "scrollintoview") {
      const selectors = getActionSelectorCandidates(action);
      const match =
        resolveSelectorAcrossRoots(selectors, getActionSearchRoots(action, selectors, { includeDocument: true })) ||
        (action.timeoutMs
          ? await waitForAnyElement(
              selectors,
              {
                timeoutMs: action.timeoutMs,
                getRoots: () => getActionSearchRoots(action, selectors, { includeDocument: true }),
              },
              signal
            )
          : null);
      const target = match ? match.element : null;
      if (!target) throw createError("Element not found", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
      action._resolvedSelector = match.selector;
      action._targetContext = getElementTargetContext(target);
      target.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
      return;
    }

    const selectors = getActionSelectorCandidates(action);
    let el = await resolveActionTarget(action, signal);
    const hasSelector = selectors.length > 0;
    if (!el && !hasSelector && (name === "press" || name === "type" || name === "input" || name === "clear")) {
      el = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    }
    if (!el) {
      // This is the only hard blocker - we genuinely can't proceed without an element
      throw createError("Element not found", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
    }
    action._targetContext = getElementTargetContext(el);
    if ((name === "click" || name === "tap") && hasTextShortcutSelector(selectors) && action._targetContext && action._targetContext.inOverlay === false) {
      const scopedRoots = [];
      const scopeCandidates = getActionScopeCandidates(action);
      for (const scope of scopeCandidates) {
        const scopeRoot = resolveScopeRoot(scope);
        if (scopeRoot && scopeRoot !== document) {
          pushUniqueRoot(scopedRoots, scopeRoot);
        }
      }
      if (scopedRoots.length) {
        const scopedMatch = resolveSelectorAcrossRoots(selectors, scopedRoots, { useDocumentFallback: false });
        if (scopedMatch && scopedMatch.element && scopedMatch.element !== el && isElementVisible(scopedMatch.element) && !isElementDisabled(scopedMatch.element)) {
          el = scopedMatch.element;
          action._resolvedSelector = scopedMatch.selector;
          action._targetContext = getElementTargetContext(el);
        }
      }
    }
    // Philosophy: Always try to execute. Don't pre-emptively block based on visibility,
    // disabled state, or overlay detection. The browser/framework handles these cases,
    // and we learn from real failures rather than guessing.
    if (action.scroll !== false) {
      try {
        el.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
      } catch {
        el.scrollIntoView();
      }
    }
    throwIfAborted(signal);
    highlightElement(el);
    const point = getActionPoint(el, action);

    if (name === "hover") {
      dispatchPointerEvent(el, "pointerover", point);
      dispatchMouseEvent(el, "mouseover", point);
      return;
    }
    if (name === "focus") {
      focusElement(el);
      return;
    }
    if (name === "blur") {
      if (el.blur) el.blur();
      return;
    }
    if (name === "click" || name === "tap") {
      await performClickAndTrackTransientRoot(el, action, signal);
      return;
    }
    if (name === "double_click" || name === "dblclick" || name === "doubleclick") {
      for (let i = 0; i < 2; i += 1) {
        dispatchPointerEvent(el, "pointerdown", point);
        dispatchMouseEvent(el, "mousedown", point);
        dispatchPointerEvent(el, "pointerup", point);
        dispatchMouseEvent(el, "mouseup", point);
        dispatchMouseEvent(el, "click", point);
      }
      dispatchMouseEvent(el, "dblclick", point);
      return;
    }
    if (name === "right_click" || name === "contextmenu") {
      dispatchMouseEvent(el, "contextmenu", point);
      return;
    }
    if (name === "type" || name === "input" || name === "set_value") {
      const text = action.text != null ? String(action.text) : action.value != null ? String(action.value) : "";
      const mode = action.mode || "replace";
      focusElement(el);
      if (mode === "append") {
        const current = el.value != null ? String(el.value) : "";
        setInputValue(el, current + text);
      } else {
        setInputValue(el, text);
      }
      return;
    }
    if (name === "clear") {
      focusElement(el);
      setInputValue(el, "");
      return;
    }
    if (name === "press") {
      const keys = action.keys || (action.key ? [action.key] : []);
      const target = el || document.activeElement || document.body;
      for (const key of keys) {
        dispatchKeyboardEvent(target, "keydown", key);
        dispatchKeyboardEvent(target, "keypress", key);
        dispatchKeyboardEvent(target, "keyup", key);
      }
      return;
    }
    if (name === "select") {
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      if (tag !== "select") {
        throw createError("Element is not a select", "SELECTOR_INVALID", "RESCAN_WITH_SCOPE");
      }
      const value = action.value != null ? String(action.value) : action.text != null ? String(action.text) : "";
      const options = Array.from(el.options || []);
      let matched = null;
      if (value) {
        matched = options.find((option) => option.value === value) || options.find((option) => normalizeText(option.textContent || "") === normalizeText(value));
      }
      if (!matched && typeof action.index === "number") {
        matched = options[action.index] || null;
      }
      if (!matched && options.length) {
        matched = options[0];
      }
      if (!matched) throw createError("Option not found", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
      el.value = matched.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (name === "check") {
      setChecked(el, true);
      return;
    }
    if (name === "uncheck") {
      setChecked(el, false);
      return;
    }
    if (name === "drag_and_drop" || name === "drag") {
      const fromSelector = action.from || action.selector;
      const toSelector = action.to || action.target;
      const source = fromSelector
        ? (resolveSelectorAcrossRoots([fromSelector], getActionSearchRoots(action, [fromSelector], { includeDocument: true })) || {}).element
        : el;
      const target = toSelector
        ? (resolveSelectorAcrossRoots([toSelector], getActionSearchRoots(action, [toSelector], { includeDocument: true })) || {}).element
        : null;
      if (!source || !target) throw createError("Drag target not found", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
      const start = getActionPoint(source, action);
      const end = getActionPoint(target, action);
      dispatchMouseEvent(source, "mousedown", start);
      dispatchMouseEvent(source, "dragstart", start);
      dispatchMouseEvent(target, "dragover", end);
      dispatchMouseEvent(target, "drop", end);
      dispatchMouseEvent(target, "mouseup", end);
      return;
    }
    if (name === "dispatch") {
      const events = Array.isArray(action.events) ? action.events : [];
      for (const evt of events) {
        if (!evt) continue;
        el.dispatchEvent(new Event(String(evt), { bubbles: true, cancelable: true }));
      }
      return;
    }

    throw createError("Unknown action: " + name, "SELECTOR_INVALID", null);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool Call Execution (Endpoint, Frontend Context, Frontend Actions)
  // ═══════════════════════════════════════════════════════════════════════════

  async function executeEndpointToolCall(toolCall, baseUrl, headerConfig, signal) {
    throwIfAborted(signal);
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
      const response = await fetchWithTimeout(url.toString(), { ...fetchOptions, signal });
      let body;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        body = await response.json();
      } else {
        body = await response.text();
      }
      return { id: toolCall.id, statusCode: response.status, body };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      return { id: toolCall.id, statusCode: 0, body: null, error: error.message || "Request failed" };
    }
  }

  async function executeReadPage(toolCall, ui, signal) {
    throwIfAborted(signal);
    const options = toolCall.readPageOptions || toolCall.context || {};
    const title = toolCall.goal || "Reading page structure";
    if (ui && typeof ui.setActivity === "function") {
      ui.setActivity({ title, status: "running", steps: [] });
    }
    try {
      let screenshot = null;
      if (ui && typeof ui.captureScreenshot === "function") {
        screenshot = await ui.captureScreenshot(signal);
      }
      throwIfAborted(signal);
      const result = buildAccessibilityTree({
        depth: options.depth || 15,
        filter: options.filter || "all",
        refId: options.refId || null,
        maxChars: options.maxChars || 50000,
      });
      if (screenshot) {
        result.screenshot = screenshot;
      }
      if (ui && typeof ui.setActivity === "function") {
        ui.setActivity({ title, status: "done", steps: [] });
        if (typeof ui.scheduleClear === "function") {
          ui.scheduleClear(900);
        }
      }
      return { id: toolCall.id, statusCode: 200, body: result };
    } catch (error) {
      if (isAbortError(error)) {
        if (ui && typeof ui.setActivity === "function") {
          ui.setActivity({ title, status: "error", steps: [] });
          if (typeof ui.scheduleClear === "function") {
            ui.scheduleClear(600);
          }
        }
        throw error;
      }
      if (ui && typeof ui.setActivity === "function") {
        ui.setActivity({ title, status: "error", steps: [] });
        if (typeof ui.scheduleClear === "function") {
          ui.scheduleClear(1400);
        }
      }
      return { id: toolCall.id, statusCode: 500, body: null, error: error.message || "read_page failed" };
    }
  }

  async function executeFindElements(toolCall, ui, signal) {
    throwIfAborted(signal);
    try {
      const result = findElements(toolCall.findQuery || "");
      return { id: toolCall.id, statusCode: 200, body: result };
    } catch (error) {
      if (isAbortError(error)) throw error;
      return { id: toolCall.id, statusCode: 500, body: null, error: error.message || "find failed" };
    }
  }

  async function executeJsExec(toolCall, ui, signal) {
    throwIfAborted(signal);
    var code = toolCall.jsCode || "";
    try {
      var fn = new Function("return (" + code + "\n)");
      var result = fn();
      var serialized = result === undefined ? "undefined" :
        typeof result === "object" ? JSON.stringify(result) : String(result);
      return { id: toolCall.id, statusCode: 200, body: { kind: "js_exec", result: serialized } };
    } catch (error) {
      if (isAbortError(error)) throw error;
      return { id: toolCall.id, statusCode: 500, body: null, error: error.message || "js_exec failed" };
    }
  }

  async function executeFrontendHandlerTool(toolCall, signal) {
    throwIfAborted(signal);
    const toolName = typeof toolCall.name === "string" ? toolCall.name.trim() : "";
    if (!toolName) {
      return { id: toolCall.id, statusCode: 400, body: null, error: "Frontend tool name is required" };
    }
    if (typeof window.warpy !== "function") {
      return {
        id: toolCall.id,
        statusCode: 400,
        body: { kind: "frontend_tool", tool: toolName },
        error: "window.warpy handler is not registered",
      };
    }
    const vars = toolCall.params && typeof toolCall.params === "object" ? toolCall.params : {};
    try {
      const result = await window.warpy(toolName, vars);
      return {
        id: toolCall.id,
        statusCode: 200,
        body: {
          kind: "frontend_tool",
          tool: toolName,
          vars,
          result: result === undefined ? null : result,
          url: window.location.href,
          title: document.title,
        },
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      return {
        id: toolCall.id,
        statusCode: 500,
        body: {
          kind: "frontend_tool",
          tool: toolName,
          vars,
        },
        error: error && error.message ? error.message : "frontend tool failed",
      };
    }
  }

  async function executeFrontendActions(toolCall, ui, signal) {
    throwIfAborted(signal);
    const actions = Array.isArray(toolCall.actions) ? toolCall.actions : [];
    const goal = toolCall.goal || "Applying changes";
    actionRuntimeState.transientRoot = null;
    if (!actions.length) {
      return {
        id: toolCall.id,
        statusCode: 400,
        body: { kind: "frontend_actions", goal, results: [], error: "No actions provided" },
      };
    }
    const results = [];
    let statusCode = 200;
    let activity = null;
    if (actions.length && ui && typeof ui.setActivity === "function") {
      activity = {
        title: goal,
        status: "running",
        steps: actions.map((action, index) => ({
          index,
          label: describeAction(normalizeAction(action)),
          status: "pending",
        })),
      };
      ui.setActivity({ ...activity });
    }

    for (let i = 0; i < actions.length; i += 1) {
      throwIfAborted(signal);
      const normalized = normalizeAction(actions[i]);
      const step = activity && activity.steps ? activity.steps[i] : null;
      if (step) {
        step.status = "running";
        ui.setActivity({ ...activity });
      }
      const startedAt = Date.now();
      const retryCount = clampInt(normalized.retryCount || 0, 0, 3);
      const retryDelayMs = clampInt(normalized.retryDelayMs || 500, 100, 2000);
      normalized._resolvedSelector = null;
      normalized._targetContext = null;
      try {
        await executeWithRetry(() => runFrontendAction(normalized, signal), retryCount, retryDelayMs, signal);
        results.push({
          index: i,
          action: normalized.action,
          selector: normalized._resolvedSelector || normalized.selector || normalized.target || null,
          scope: normalized.scope || null,
          targetContext: normalized._targetContext,
          status: "ok",
          durationMs: Date.now() - startedAt,
        });
        if (step) {
          step.status = "done";
          ui.setActivity({ ...activity });
        }
      } catch (error) {
        if (isAbortError(error)) {
          if (step) {
            step.status = "error";
            ui.setActivity({ ...activity });
          }
          if (activity && ui && typeof ui.setActivity === "function") {
            activity.status = "error";
            ui.setActivity({ ...activity });
            if (typeof ui.scheduleClear === "function") {
              ui.scheduleClear(700);
            }
          }
          clearHighlight();
          throw error;
        }
        const result = {
          index: i,
          action: normalized.action,
          selector: normalized._resolvedSelector || normalized.selector || normalized.target || null,
          scope: normalized.scope || null,
          targetContext: normalized._targetContext,
          status: "error",
          error: error.message || "Action failed",
          durationMs: Date.now() - startedAt,
        };
        // Include structured error info if available
        if (error.errorCode) {
          result.errorCode = error.errorCode;
        }
        if (error.recoveryHint) {
          result.recoveryHint = error.recoveryHint;
        }
        results.push(result);
        statusCode = 207;
        if (step) {
          step.status = "error";
          ui.setActivity({ ...activity });
        }
        if (!normalized.continueOnError) {
          break;
        }
      }
      const delay = clampInt(normalized.delayMs || 0, 0, 10000);
      if (delay) {
        await sleep(delay, signal);
      }
    }

    if (activity && ui && typeof ui.setActivity === "function") {
      activity.status = statusCode === 200 ? "done" : "error";
      ui.setActivity({ ...activity });
      if (typeof ui.scheduleClear === "function") {
        ui.scheduleClear(1400);
      }
    }
    clearHighlight();
    return {
      id: toolCall.id,
      statusCode,
      body: {
        kind: "frontend_actions",
        goal,
        url: window.location.href,
        title: document.title,
        results,
      },
    };
  }

  async function executeToolCall(toolCall, baseUrl, headerConfig, ui, signal) {
    throwIfAborted(signal);
    const type = resolveToolType(toolCall);
    if (type === "backend") {
      return executeEndpointToolCall(toolCall, baseUrl, headerConfig, signal);
    }
    if (type === "read_page") {
      return executeReadPage(toolCall, ui, signal);
    }
    if (type === "find_elements") {
      return executeFindElements(toolCall, ui, signal);
    }
    if (type === "frontend") {
      if ((toolCall.name || "") !== "frontend") {
        return executeFrontendHandlerTool(toolCall, signal);
      }
      return executeFrontendActions(toolCall, ui, signal);
    }
    if (type === "js_exec") {
      return executeJsExec(toolCall, ui, signal);
    }
    return { id: toolCall.id, statusCode: 400, body: null, error: "Unknown tool type" };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // External Script Loading & Markdown Rendering
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // Widget Styles (Shadow DOM)
  // ═══════════════════════════════════════════════════════════════════════════

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
        --cta-border-strong: rgba(17, 24, 39, 0.18);
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
        width: 42px;
        height: 42px;
        padding: 0;
        gap: 0;
        border-radius: 999px;
        background: var(--cta-surface);
        border: 1px solid var(--cta-border-strong);
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
        overflow: hidden;
      }

      .cta-widget-toggle[data-behavior="push"] {
        right: calc(-10px + env(safe-area-inset-right, 0px));
        transform: translateY(-50%);
        width: 48px;
        height: 48px;
        padding: 0;
        border-radius: 16px 0 0 16px;
        opacity: 1;
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

      .cta-widget-toggle.open[data-behavior="push"] {
        transform: translateY(-50%) translateX(12px);
      }

      .cta-widget-toggle:focus-visible {
        outline: none;
        box-shadow: 0 18px 60px var(--cta-shadow-color), 0 0 0 4px var(--cta-focus);
      }

      .cta-widget-toggle-brand {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .cta-widget-toggle-brand {
        width: 22px;
        height: 22px;
      }

      .cta-widget-toggle-brand svg,
      .cta-widget-toggle-brand img {
        width: 22px;
        height: 22px;
      }

      .cta-widget-toggle-brand img {
        border-radius: 6px;
        object-fit: contain;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
      }

      .cta-widget-toggle.has-unread::after {
        content: "";
        position: absolute;
        top: 7px;
        right: 7px;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--cta-accent);
        box-shadow: 0 0 0 2px var(--cta-surface-strong), 0 0 0 0 var(--cta-focus);
        pointer-events: none;
      }

      .cta-widget-toggle[data-behavior="push"].has-unread::after {
        top: 9px;
        right: 18px;
      }

      .cta-widget-toggle.unread-pulse::after {
        animation: cta-widget-unread-pulse 420ms ease-out;
      }

      .cta-widget-toggle-warning {
        position: fixed;
        right: calc(66px + env(safe-area-inset-right, 0px));
        transform: translateY(-50%) translateX(8px);
        max-width: min(280px, calc(100vw - 96px));
        padding: 8px 10px;
        border-radius: 12px;
        border: 1px solid var(--cta-border);
        background: var(--cta-surface-strong);
        color: var(--cta-fg);
        font-size: 12px;
        line-height: 1.35;
        box-shadow: 0 14px 42px var(--cta-shadow-color);
        opacity: 0;
        pointer-events: none;
        transition: opacity 180ms ease, transform 180ms ease;
        z-index: 2;
      }

      .cta-widget-toggle-warning[data-behavior="push"] {
        right: calc(80px + env(safe-area-inset-right, 0px));
      }

      .cta-widget-toggle-warning.visible {
        opacity: 1;
        transform: translateY(-50%) translateX(0);
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

        .cta-widget-toggle[data-behavior="push"] {
          transform: translateY(-50%);
        }
      }

      @media (max-width: 640px) {
        .cta-widget-toggle-warning {
          max-width: min(220px, calc(100vw - 88px));
          font-size: 11px;
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
        box-shadow: -4px 0 24px var(--cta-shadow-color);
        display: grid;
        grid-template-rows: auto 1fr auto;
        grid-template-areas:
          "header"
          "messages"
          "footer";
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

      .cta-widget-resize-rail {
        position: absolute;
        top: 12px;
        left: 0;
        bottom: 12px;
        width: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--cta-fg-muted);
        opacity: 0;
        pointer-events: none;
        cursor: ew-resize;
        touch-action: none;
        transition: opacity 160ms ease, box-shadow 160ms ease;
        z-index: 4;
      }

      .cta-widget-resize-rail.active {
        opacity: 1;
        pointer-events: auto;
      }

      .cta-widget-resize-rail:focus-visible {
        outline: none;
        box-shadow: inset 1px 0 0 var(--cta-border-strong);
      }

      .cta-widget-resize-grip {
        position: relative;
        width: 3px;
        height: 42px;
        border-radius: 999px;
        background: var(--cta-border-strong);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4);
        transition: transform 160ms ease;
      }

      .cta-widget-resize-rail:hover .cta-widget-resize-grip,
      .cta-widget-resize-rail:focus-visible .cta-widget-resize-grip,
      .cta-widget-resize-rail.dragging .cta-widget-resize-grip {
        transform: scaleX(1.25);
      }

      @media (max-width: 640px) {
        .cta-widget-panel {
          width: 100vw;
          border-radius: 0;
        }

        .cta-widget-resize-rail {
          display: none;
        }
      }

      .cta-widget-header {
        grid-area: header;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        padding-top: calc(10px + env(safe-area-inset-top, 0px));
        background: transparent;
      }

      .cta-widget-header-left {
        display: flex;
        align-items: center;
        min-width: 32px;
      }

      .cta-widget-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .cta-widget-close {
        width: 32px;
        height: 32px;
        padding: 0;
        background: transparent;
        border: none;
        cursor: pointer;
        border-radius: 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: var(--cta-fg-muted);
        transition: color 160ms ease, transform 160ms ease;
      }

      .cta-widget-close:hover {
        color: var(--cta-fg);
      }

      .cta-widget-close-hint {
        display: none;
        align-items: center;
        padding: 2px 6px;
        border-radius: 8px;
        border: none;
        color: inherit;
        font-size: 11px;
        line-height: 1;
      }

      @media (hover: hover) and (pointer: fine) {
        .cta-widget-close {
          width: auto;
          padding: 0 8px;
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
        width: 16px;
        height: 16px;
        color: inherit;
      }

      .cta-widget-new-chat {
        width: 32px;
        height: 32px;
        padding: 0;
        background: transparent;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--cta-fg-muted);
        transition: color 160ms ease, transform 160ms ease;
      }

      .cta-widget-new-chat:hover {
        color: var(--cta-fg);
      }

      .cta-widget-new-chat:active {
        transform: translateY(1px);
      }

      .cta-widget-new-chat:focus-visible {
        outline: none;
        box-shadow: 0 0 0 4px var(--cta-focus);
      }

      .cta-widget-new-chat svg {
        width: 16px;
        height: 16px;
        color: inherit;
      }

      .cta-widget-security-btn {
        width: 32px;
        height: 32px;
        padding: 0;
        background: transparent;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--cta-fg-muted);
        transition: color 160ms ease, transform 160ms ease;
      }

      .cta-widget-security-btn:hover {
        color: var(--cta-fg);
      }

      .cta-widget-security-btn:active {
        transform: translateY(1px);
      }

      .cta-widget-security-btn:focus-visible {
        outline: none;
        box-shadow: 0 0 0 4px var(--cta-focus);
      }

      .cta-widget-security-btn svg {
        width: 16px;
        height: 16px;
        color: inherit;
      }

      .cta-security-panel {
        position: absolute;
        inset: 0;
        background: rgba(var(--cta-bg-rgb, 255, 255, 255), 0.985);
        display: flex;
        flex-direction: column;
        z-index: 10;
        transform: translateX(100%);
        transition: transform 240ms cubic-bezier(0.2, 0.9, 0.2, 1);
      }

      .cta-security-panel.open {
        transform: translateX(0);
      }

      .cta-security-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        padding-top: calc(10px + env(safe-area-inset-top, 0px));
        background: transparent;
      }

      .cta-security-back {
        width: 32px;
        height: 32px;
        padding: 0;
        background: transparent;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--cta-fg-muted);
        transition: color 160ms ease;
      }

      .cta-security-back:hover {
        color: var(--cta-fg);
      }

      .cta-security-back:focus-visible {
        outline: none;
        box-shadow: 0 0 0 4px var(--cta-focus);
      }

      .cta-security-back svg {
        width: 16px;
        height: 16px;
        color: inherit;
      }

      .cta-security-title {
        font-size: 13px;
        font-weight: 600;
        margin: 0;
      }

      .cta-security-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px 16px;
        background: transparent;
      }

      .cta-security-section {
        margin-bottom: 24px;
      }

      .cta-security-section:last-child {
        margin-bottom: 0;
      }

      .cta-security-section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--cta-fg-muted);
        margin: 0 0 12px;
      }

      .cta-security-provider {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .cta-security-provider-icon {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--cta-bubble-assistant);
        border: 1px solid var(--cta-border);
      }

      .cta-security-provider-icon svg {
        width: 16px;
        height: 16px;
        color: var(--cta-accent);
      }

      .cta-security-provider-name {
        font-size: 14px;
        font-weight: 600;
        margin: 0;
      }

      .cta-security-text {
        font-size: 13px;
        line-height: 1.55;
        color: var(--cta-fg-muted);
        margin: 0;
      }

      .cta-widget-messages {
        grid-area: messages;
        overflow-y: auto;
        min-height: 0;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: transparent;
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
        width: 62px;
        height: 62px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
        background: var(--cta-surface-strong);
        border: 1px solid var(--cta-border);
      }

      .cta-widget-empty-icon svg,
      .cta-widget-empty-icon img {
        width: 30px;
        height: 30px;
      }

      .cta-widget-empty-icon svg {
        color: var(--cta-accent);
      }

      .cta-widget-empty-icon img {
        border-radius: 10px;
        object-fit: contain;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
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

      .cta-widget-activity {
        border: 1px solid var(--cta-border);
        background: var(--cta-surface-strong);
        border-radius: 16px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        position: sticky;
        bottom: 0;
        z-index: 1;
        margin-top: auto;
      }

      .cta-widget-activity-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--cta-fg);
      }

      .cta-widget-activity-status {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--cta-fg-muted);
      }

      .cta-widget-activity-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .cta-widget-activity-step {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--cta-fg-muted);
      }

      .cta-widget-activity-step::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: var(--cta-border);
        flex-shrink: 0;
      }

      .cta-widget-activity-step[data-status="running"] {
        color: var(--cta-fg);
      }

      .cta-widget-activity-step[data-status="running"]::before {
        background: var(--cta-accent);
        animation: cta-widget-activity-pulse 1s ease-in-out infinite;
      }

      .cta-widget-activity-step[data-status="done"] {
        color: var(--cta-fg);
      }

      .cta-widget-activity-step[data-status="done"]::before {
        background: var(--cta-fg-muted);
      }

      .cta-widget-activity-step[data-status="error"] {
        color: var(--cta-accent);
      }

      .cta-widget-activity-step[data-status="error"]::before {
        background: var(--cta-accent);
      }

      .cta-widget-screen-prompt {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 12px;
        background: var(--cta-bubble-assistant);
        border: 1px solid var(--cta-border);
        position: sticky;
        top: 0;
        z-index: 2;
      }

      .cta-widget-screen-prompt-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: var(--cta-border-strong);
        flex-shrink: 0;
      }

      .cta-widget-screen-prompt.sharing .cta-widget-screen-prompt-dot {
        background: var(--cta-accent);
        animation: cta-widget-activity-pulse 1s ease-in-out infinite;
      }

      .cta-widget-screen-prompt-body {
        flex: 1;
        min-width: 0;
        font-size: 12px;
        line-height: 1.35;
        color: var(--cta-fg-muted);
      }

      .cta-widget-screen-prompt-countdown {
        font-size: 11px;
        opacity: 0.7;
      }

      .cta-widget-screen-prompt-btn {
        height: 28px;
        padding: 0 10px;
        border-radius: 8px;
        border: 1px solid var(--cta-border);
        background: var(--cta-surface-strong);
        color: var(--cta-fg);
        font-size: 11px;
        cursor: pointer;
        flex-shrink: 0;
        transition: opacity 160ms ease, transform 160ms ease;
      }

      .cta-widget-screen-prompt-btn:hover {
        opacity: 0.8;
      }

      .cta-widget-screen-prompt-btn:active {
        transform: translateY(1px);
      }

      .cta-widget-screen-prompt-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .cta-widget-screen-prompt-btn:focus-visible {
        outline: none;
        box-shadow: 0 0 0 4px var(--cta-focus);
      }

      .cta-widget-screen-prompt-btn.primary {
        background: var(--cta-accent);
        color: var(--cta-accent-contrast);
        border-color: transparent;
        font-weight: 600;
      }

      .cta-widget-screen-prompt-link {
        background: none;
        border: none;
        padding: 0;
        color: var(--cta-fg-muted);
        font-size: 11px;
        cursor: pointer;
        flex-shrink: 0;
        text-decoration: none;
        transition: color 160ms ease;
      }

      .cta-widget-screen-prompt-link:hover {
        color: var(--cta-fg);
      }

      .cta-widget-screen-prompt-link:focus-visible {
        outline: none;
        text-decoration: underline;
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

      .cta-widget-message-actions {
        margin-top: 10px;
        display: flex;
        justify-content: flex-start;
      }

      .cta-widget-resume {
        height: 30px;
        padding: 0 12px;
        border-radius: 10px;
        border: 1px solid var(--cta-border);
        background: var(--cta-surface-strong);
        color: var(--cta-fg);
        font-size: 12px;
        cursor: pointer;
        transition: opacity 160ms ease, transform 160ms ease;
      }

      .cta-widget-resume:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      .cta-widget-resume:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .cta-widget-resume:focus-visible {
        outline: none;
        box-shadow: 0 0 0 4px var(--cta-focus);
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
        grid-area: footer;
        position: relative;
        padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
        background: transparent;
      }

      .cta-widget-front-warning {
        margin-bottom: 8px;
        padding: 8px 10px;
        border-radius: 12px;
        border: 1px solid var(--cta-border);
        background: var(--cta-bubble-assistant);
        color: var(--cta-fg);
        font-size: 12px;
        line-height: 1.35;
        display: none;
      }

      .cta-widget-front-warning.visible {
        display: block;
      }

      .cta-widget-input-row {
        display: flex;
        gap: 8px;
        align-items: flex-end;
      }

      .cta-widget-input {
        flex: 1;
        height: 42px;
        padding: 0 12px;
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
        width: 42px;
        height: 42px;
        background: transparent;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 160ms ease, color 160ms ease;
        flex-shrink: 0;
        color: var(--cta-fg-muted);
      }

      .cta-widget-send:hover:not(:disabled) {
        transform: translateY(-1px);
        color: var(--cta-accent);
      }

      .cta-widget-send.is-stop {
        color: var(--cta-fg);
      }

      .cta-widget-send.is-stop:hover:not(:disabled) {
        color: var(--cta-fg);
      }

      .cta-widget-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .cta-widget-send:focus-visible {
        outline: none;
        box-shadow: 0 0 0 4px var(--cta-focus);
      }

      .cta-widget-send svg {
        width: 18px;
        height: 18px;
        color: inherit;
      }

      .cta-widget-send.is-stop svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
        stroke: none;
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
        width: 42px;
        height: 42px;
        border: none;
        border-radius: 12px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        flex-shrink: 0;
        color: var(--cta-fg-muted);
      }

      .cta-widget-mic svg {
        width: 18px;
        height: 18px;
        color: inherit;
      }

      .cta-widget-mic.paired {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
      }

      .cta-widget-mic-select {
        width: 32px;
        height: 42px;
        border: none;
        border-radius: 0 12px 12px 0;
        margin-left: -1px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        flex-shrink: 0;
        color: var(--cta-fg-muted);
      }

      .cta-widget-mic-select svg {
        width: 14px;
        height: 14px;
        color: inherit;
      }

      .cta-widget-mic:disabled,
      .cta-widget-mic-select:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .cta-widget-mic:hover:not(:disabled),
      .cta-widget-mic-select:hover:not(:disabled) {
        color: var(--cta-fg);
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
        background: var(--cta-bg);
        border: 1px solid var(--cta-border);
        border-radius: 14px;
        box-shadow: 0 18px 60px var(--cta-shadow-color);
        display: none;
        overflow: hidden;
        z-index: 5;
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

      @keyframes cta-widget-activity-pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.35); }
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
        .cta-widget-mic-select,
        .cta-widget-resize-rail,
        .cta-widget-resize-grip {
          transition: none !important;
        }

        .cta-widget-loading span,
        .cta-widget-mic.recording {
          animation: none !important;
        }

        .cta-widget-toggle.unread-pulse::after {
          animation: none !important;
        }

        .cta-widget-activity-step[data-status="running"]::before {
          animation: none !important;
        }
      }
    `;
    return style;
  }

  function ensurePagePushStyle() {
    if (!document.head) return null;
    const existing = document.getElementById(PAGE_PUSH_STYLE_ID);
    if (existing) return existing;
    const style = document.createElement("style");
    style.id = PAGE_PUSH_STYLE_ID;
    style.textContent = `
      body[${PAGE_PUSH_READY_ATTR}="true"] {
        transition: margin-right 240ms cubic-bezier(0.2, 0.9, 0.2, 1);
      }

      html[${PAGE_PUSH_ACTIVE_ATTR}="true"] {
        overflow-x: hidden;
      }

      html[${PAGE_PUSH_ACTIVE_ATTR}="true"] body[${PAGE_PUSH_READY_ATTR}="true"] {
        margin-right: var(${PAGE_PUSH_OFFSET_VAR}, 0px) !important;
      }
    `;
    document.head.appendChild(style);
    return style;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Widget Creation & Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  function createWidget(config, initialConfigData) {
    const apiUrl = resolveApiUrl();
    ensurePagePushStyle();

    // ─── State ───────────────────────────────────────────────────────────────

    const state = loadState() || { messages: [], conversationId: null, voice: {}, auth: {}, ui: {} };
    if (!state.voice) state.voice = {};
    if (!state.auth) state.auth = {};
    if (!state.ui) state.ui = {};
    const savedUi = loadUiState();
    if (savedUi && typeof savedUi.launcherY === "number") {
      state.ui.launcherY = clamp(savedUi.launcherY, 0, 1);
    }
    if (typeof state.ui.panelWidth === "number") {
      state.ui.panelWidth = clampInt(state.ui.panelWidth, PANEL_BASE_MIN_WIDTH, PANEL_BASE_MAX_WIDTH);
    }
    if (savedUi && typeof savedUi.panelWidth === "number") {
      state.ui.panelWidth = clampInt(savedUi.panelWidth, PANEL_BASE_MIN_WIDTH, PANEL_BASE_MAX_WIDTH);
    }
    if (typeof state.ui.launcherY !== "number") {
      state.ui.launcherY = 0.72;
      saveUiState(state.ui);
      saveState(state);
    }
    if (typeof state.ui.panelWidth !== "number") {
      state.ui.panelWidth = PANEL_BASE_MIN_WIDTH;
      saveUiState(state.ui);
      saveState(state);
    }

    // Auto-resume state tracking
    let isNavigatingAway = false;
    window.addEventListener("pagehide", () => {
      isNavigatingAway = true;
      if (isLoading && state.activeQuery) {
        state.interruptedByNavigation = true;
        saveState(state);
      }
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        isNavigatingAway = false;
      }
    });
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

    const DEFAULT_WIDGET_ICON = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 4V11.5A8.5 8.5 0 1 1 21 11.5z"/>
      </svg>
    `;
    const SEND_ICON = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
      </svg>
    `;
    const STOP_ICON = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="2"></rect>
      </svg>
    `;

    let widgetTitle = "Warpy";
    let widgetIconUrl = null;
    let widgetBehavior = "overlay";
    let widgetEmptyTitle = "What would you like to do?";
    let widgetEmptyDescription = "Ask a question, request help, or describe what you want to get done.";
    let widgetInputPlaceholder = "Ask Warpy…";
    let securityDisclosureEnabled = true;
    let isSecurityPanelOpen = false;
    let frontendActivity = null;
    let frontendActivityTimer = null;
    let chatEpoch = 0;
    let activeRunAbortController = null;
    let frontendWarningText = "";
    let frontendWarningVisibleSince = 0;
    let frontendWarningTimer = null;
    let pagePushReadyTimer = null;
    let screenSharePromiseResolve = null;
    let screenShareDismissed = false;
    let screenShareCountdown = 0;
    let screenShareCountdownInterval = null;

    // ─── DOM Construction ──────────────────────────────────────────────────

    const root = document.createElement("div");
    let widgetHidden = false;

    function hideWidget() {
      if (widgetHidden) return;
      widgetHidden = true;
      chatEpoch += 1;
      stopCurrentExecution();
      closePanel({ restoreLauncherFocus: false });
      clearPagePushLayout();
      clearHighlight();
      clearFrontendWarning();
      stopScreenShare();
      clearScreenShareCountdown();
      if (screenSharePromiseResolve) {
        screenSharePromiseResolve(false);
        screenSharePromiseResolve = null;
      }
      root.style.display = "none";
      root.setAttribute("aria-hidden", "true");
    }

    const scrim = document.createElement("div");
    scrim.className = "cta-widget-scrim";

    const toggle = document.createElement("button");
    toggle.className = "cta-widget-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `<span class="cta-widget-toggle-brand">${DEFAULT_WIDGET_ICON}</span>`;

    const toggleWarning = document.createElement("div");
    toggleWarning.className = "cta-widget-toggle-warning";
    toggleWarning.setAttribute("aria-live", "polite");

    const panel = document.createElement("div");
    panel.className = "cta-widget-panel";
    panel.id = "cta-widget-panel";
    panel.setAttribute("role", "dialog");
    toggle.setAttribute("aria-controls", panel.id);
    panel.innerHTML = `
      <div
        class="cta-widget-resize-rail"
        role="separator"
        aria-controls="cta-widget-panel"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        aria-disabled="true"
        tabindex="-1"
      >
        <span class="cta-widget-resize-grip" aria-hidden="true"></span>
      </div>
      <div class="cta-widget-header">
        <div class="cta-widget-header-left">
          <button class="cta-widget-security-btn" aria-label="Security & Privacy" title="Security & Privacy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </button>
        </div>
        <div class="cta-widget-header-actions">
          <button class="cta-widget-new-chat" aria-label="Start new chat" title="Start new chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H8l-5 5V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <path d="M12 7v6M9 10h6"/>
            </svg>
          </button>
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
        <div class="cta-widget-front-warning" aria-live="polite"></div>
        <div class="cta-widget-input-row">
          <input type="text" class="cta-widget-input" placeholder="" />
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
          <button class="cta-widget-send" aria-label="Send message">${SEND_ICON}</button>
        </div>
        <div class="cta-voice-hint" aria-live="polite"></div>
        <div class="cta-voice-error" aria-live="assertive"></div>
      </div>
      <div class="cta-security-panel">
        <div class="cta-security-header">
          <button class="cta-security-back" aria-label="Back to chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <h2 class="cta-security-title">Security & privacy</h2>
        </div>
        <div class="cta-security-content">
          <div class="cta-security-section">
            <p class="cta-security-section-title">Provider</p>
            <div class="cta-security-provider">
              <div class="cta-security-provider-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <p class="cta-security-provider-name">Warpy.ai</p>
            </div>
          </div>
          <div class="cta-security-section">
            <p class="cta-security-section-title">Permissions</p>
            <p class="cta-security-text">Executes only allowed actions and operates within your authenticated session. All requests are made on your behalf with your existing permissions.</p>
          </div>
          <div class="cta-security-section">
            <p class="cta-security-section-title">Data Privacy</p>
            <p class="cta-security-text">Your data remains secure and is never shared with third parties without your consent. Conversations are processed to provide helpful responses.</p>
          </div>
        </div>
      </div>
    `;

    root.appendChild(scrim);
    root.appendChild(toggle);
    root.appendChild(toggleWarning);
    root.appendChild(panel);

    const messagesEl = panel.querySelector(".cta-widget-messages");
    const inputEl = panel.querySelector(".cta-widget-input");
    const sendEl = panel.querySelector(".cta-widget-send");
    const resizeHandle = panel.querySelector(".cta-widget-resize-rail");
    const closeEl = panel.querySelector(".cta-widget-close");
    const newChatEl = panel.querySelector(".cta-widget-new-chat");
    const micEl = panel.querySelector(".cta-widget-mic");
    const micSelectEl = panel.querySelector(".cta-widget-mic-select");
    const micMenuEl = panel.querySelector(".cta-widget-mic-menu");
    const voiceHintEl = panel.querySelector(".cta-voice-hint");
    const voiceErrorEl = panel.querySelector(".cta-voice-error");
    const frontWarningEl = panel.querySelector(".cta-widget-front-warning");
    const securityBtnEl = panel.querySelector(".cta-widget-security-btn");
    const securityPanelEl = panel.querySelector(".cta-security-panel");
    const securityBackEl = panel.querySelector(".cta-security-back");
    const renderMarkdown = createMarkdownRenderer(() => renderMessages());

    // ─── UI Sync Helpers ────────────────────────────────────────────────────

    function getViewportWidth() {
      if (window.visualViewport && typeof window.visualViewport.width === "number") {
        return window.visualViewport.width;
      }
      return window.innerWidth;
    }

    function isMobilePanelViewport() {
      return getViewportWidth() <= PANEL_MOBILE_BREAKPOINT;
    }

    function getPanelMinWidth() {
      if (isMobilePanelViewport()) return getViewportWidth();
      return Math.min(PANEL_BASE_MIN_WIDTH, Math.max(0, getViewportWidth() - PANEL_VIEWPORT_GUTTER));
    }

    function getPanelMaxWidth() {
      if (isMobilePanelViewport()) return getViewportWidth();
      return Math.max(getPanelMinWidth(), Math.min(PANEL_BASE_MAX_WIDTH, Math.max(0, getViewportWidth() - PANEL_VIEWPORT_GUTTER)));
    }

    function isPanelResizable() {
      return !isMobilePanelViewport() && getPanelMaxWidth() > getPanelMinWidth();
    }

    function getPreferredPanelWidth() {
      const width = typeof state.ui.panelWidth === "number" ? state.ui.panelWidth : PANEL_BASE_MIN_WIDTH;
      return clampInt(width, PANEL_BASE_MIN_WIDTH, PANEL_BASE_MAX_WIDTH);
    }

    function getAppliedPanelWidth() {
      if (isMobilePanelViewport()) return getViewportWidth();
      return clampInt(getPreferredPanelWidth(), getPanelMinWidth(), getPanelMaxWidth());
    }

    function syncResizeHandle() {
      const active = isOpen && isPanelResizable();
      resizeHandle.classList.toggle("active", active);
      resizeHandle.setAttribute("aria-disabled", active ? "false" : "true");
      resizeHandle.tabIndex = active ? 0 : -1;
      resizeHandle.setAttribute("aria-valuemin", String(Math.round(getPanelMinWidth())));
      resizeHandle.setAttribute("aria-valuemax", String(Math.round(getPanelMaxWidth())));
      resizeHandle.setAttribute("aria-valuenow", String(Math.round(getAppliedPanelWidth())));
    }

    function persistPanelWidth() {
      saveUiState(state.ui);
      saveState(state);
    }

    function setPreferredPanelWidth(width, { persist = false } = {}) {
      state.ui.panelWidth = clampInt(width, PANEL_BASE_MIN_WIDTH, PANEL_BASE_MAX_WIDTH);
      if (persist) {
        persistPanelWidth();
      }
    }

    function applyPanelWidth() {
      if (isMobilePanelViewport()) {
        panel.style.removeProperty("width");
      } else {
        panel.style.width = `${getAppliedPanelWidth()}px`;
      }
      syncResizeHandle();
      syncBehaviorUi();
    }

    function getResolvedWidgetBehavior() {
      if (widgetBehavior !== "push") return "overlay";
      return getViewportWidth() > PAGE_PUSH_BREAKPOINT ? "push" : "overlay";
    }

    function getToggleAriaLabel() {
      const baseLabel =
        getResolvedWidgetBehavior() === "push"
          ? `Open ${widgetTitle} and make space on the page`
          : `Open ${widgetTitle}`;
      return hasUnread ? `${baseLabel} (new message)` : baseLabel;
    }

    function getBrandIconMarkup() {
      if (!widgetIconUrl) return DEFAULT_WIDGET_ICON;
      return `<img src="${escapeHtml(widgetIconUrl)}" alt="" aria-hidden="true" draggable="false" />`;
    }

    function getToggleMarkup() {
      return `<span class="cta-widget-toggle-brand">${getBrandIconMarkup()}</span>`;
    }

    function ensurePagePushReady() {
      if (!document.body) return;
      if (pagePushReadyTimer) {
        clearTimeout(pagePushReadyTimer);
        pagePushReadyTimer = null;
      }
      document.body.setAttribute(PAGE_PUSH_READY_ATTR, "true");
    }

    function schedulePagePushReadyCleanup() {
      if (!document.body) return;
      if (!document.body.hasAttribute(PAGE_PUSH_READY_ATTR) && !pagePushReadyTimer) return;
      if (pagePushReadyTimer) {
        clearTimeout(pagePushReadyTimer);
      }
      pagePushReadyTimer = setTimeout(() => {
        pagePushReadyTimer = null;
        if (document.documentElement && document.documentElement.getAttribute(PAGE_PUSH_ACTIVE_ATTR) === "true") {
          return;
        }
        document.body.removeAttribute(PAGE_PUSH_READY_ATTR);
      }, PAGE_PUSH_TRANSITION_MS);
    }

    function clearPagePushLayout() {
      if (document.documentElement) {
        document.documentElement.removeAttribute(PAGE_PUSH_ACTIVE_ATTR);
        document.documentElement.style.removeProperty(PAGE_PUSH_OFFSET_VAR);
      }
      schedulePagePushReadyCleanup();
    }

    function syncBehaviorUi() {
      const resolvedBehavior = getResolvedWidgetBehavior();
      toggle.setAttribute("data-behavior", resolvedBehavior);
      toggleWarning.setAttribute("data-behavior", resolvedBehavior);
      if (!isOpen || resolvedBehavior !== "push" || !document.documentElement) {
        clearPagePushLayout();
        return;
      }
      ensurePagePushReady();
      const fallbackWidth = getAppliedPanelWidth();
      const panelWidth = Math.max(0, Math.round(panel.getBoundingClientRect().width || fallbackWidth));
      document.documentElement.setAttribute(PAGE_PUSH_ACTIVE_ATTR, "true");
      document.documentElement.style.setProperty(PAGE_PUSH_OFFSET_VAR, `${panelWidth}px`);
    }

    function syncToggleAriaLabel() {
      toggle.setAttribute("aria-label", getToggleAriaLabel());
    }

    function syncHeader() {
      panel.setAttribute("aria-label", widgetTitle);
      if (inputEl) inputEl.setAttribute("placeholder", widgetInputPlaceholder);
    }

    function syncIcons() {
      toggle.innerHTML = getToggleMarkup();
    }

    function syncSecurityButton() {
      if (securityBtnEl) {
        securityBtnEl.style.display = securityDisclosureEnabled ? "inline-flex" : "none";
      }
    }

    function applyWidgetUiConfig() {
      syncHeader();
      syncIcons();
      syncSecurityButton();
      applyPanelWidth();
      syncToggleAriaLabel();
      syncSendButton();
      syncFrontendWarningUi();
      renderMessages();
    }

    function syncToggleWarningPosition() {
      const top = parseFloat(toggle.style.top);
      if (Number.isFinite(top)) {
        toggleWarning.style.top = `${top}px`;
        return;
      }
      const rect = toggle.getBoundingClientRect();
      toggleWarning.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    }

    function syncFrontendWarningUi() {
      const hasWarning = Boolean(frontendWarningText);
      if (frontWarningEl) {
        frontWarningEl.textContent = frontendWarningText;
        frontWarningEl.classList.toggle("visible", hasWarning);
      }
      toggleWarning.textContent = frontendWarningText;
      toggleWarning.classList.toggle("visible", hasWarning && !isOpen);
      syncToggleWarningPosition();
    }

    function showFrontendWarning(message) {
      frontendWarningText = message || "";
      if (!frontendWarningVisibleSince && frontendWarningText) {
        frontendWarningVisibleSince = Date.now();
      }
      if (frontendWarningTimer) {
        clearTimeout(frontendWarningTimer);
        frontendWarningTimer = null;
      }
      syncFrontendWarningUi();
    }

    function scheduleFrontendWarningClear(delayMs) {
      if (!frontendWarningText) return;
      const visibleFor = Date.now() - frontendWarningVisibleSince;
      const minRemaining = Math.max(0, FRONTEND_WARNING_MIN_VISIBLE_MS - visibleFor);
      const delay = Math.max(delayMs || 0, minRemaining);
      if (frontendWarningTimer) {
        clearTimeout(frontendWarningTimer);
      }
      frontendWarningTimer = setTimeout(() => {
        frontendWarningText = "";
        frontendWarningVisibleSince = 0;
        frontendWarningTimer = null;
        syncFrontendWarningUi();
      }, delay);
      syncFrontendWarningUi();
    }

    async function primeFrontendWarning(signal) {
      showFrontendWarning("The agent is running page actions. Avoid using the dashboard until it finishes.");
      await sleep(FRONTEND_WARNING_LEAD_MS, signal);
    }

    function clearFrontendWarning() {
      if (frontendWarningTimer) {
        clearTimeout(frontendWarningTimer);
        frontendWarningTimer = null;
      }
      frontendWarningText = "";
      frontendWarningVisibleSince = 0;
      syncFrontendWarningUi();
    }

    function syncSendButton() {
      const showStop = isLoading && isOpen;
      sendEl.classList.toggle("is-stop", showStop);
      sendEl.setAttribute("aria-label", showStop ? "Stop running actions" : "Send message");
      sendEl.setAttribute("title", showStop ? "Stop running actions" : "Send message");
      sendEl.innerHTML = showStop ? STOP_ICON : SEND_ICON;
      sendEl.disabled = !showStop && isTranscribing;
    }

    function stopCurrentExecution() {
      if (!activeRunAbortController || activeRunAbortController.signal.aborted) return;
      activeRunAbortController.abort();
    }

    // ─── Frontend Activity Tracking ──────────────────────────────────────────

    function setFrontendActivity(activity) {
      frontendActivity = activity;
      if (!activity && frontendActivityTimer) {
        clearTimeout(frontendActivityTimer);
        frontendActivityTimer = null;
      }
      renderMessages();
    }

    function scheduleFrontendActivityClear(delayMs) {
      if (frontendActivityTimer) {
        clearTimeout(frontendActivityTimer);
      }
      frontendActivityTimer = setTimeout(() => {
        frontendActivity = null;
        frontendActivityTimer = null;
        renderMessages();
      }, delayMs || 1200);
    }

    function clearFrontendActivity() {
      if (frontendActivityTimer) {
        clearTimeout(frontendActivityTimer);
        frontendActivityTimer = null;
      }
      frontendActivity = null;
      renderMessages();
    }

    // ─── Launcher Positioning & Drag ─────────────────────────────────────────

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
      syncToggleWarningPosition();
    }

    function persistLauncherPosition() {
      const height = getViewportHeight();
      const top = parseFloat(toggle.style.top);
      if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) return;
      state.ui.launcherY = clamp(top / height, 0, 1);
      saveUiState(state.ui);
      saveState(state);
    }

    function handleViewportResize() {
      applyLauncherPosition();
      applyPanelWidth();
      syncToggleAriaLabel();
    }

    applyLauncherPosition();
    applyPanelWidth();

    if (window.visualViewport && typeof window.visualViewport.addEventListener === "function") {
      window.visualViewport.addEventListener("resize", handleViewportResize, { passive: true });
      window.visualViewport.addEventListener("scroll", applyLauncherPosition, { passive: true });
    } else {
      window.addEventListener("resize", handleViewportResize, { passive: true });
    }

    let ignoreToggleClick = false;
    let dragPointerId = null;
    let dragStartClientY = 0;
    let dragStartTop = 0;
    let resizePointerId = null;
    let resizeStartClientX = 0;
    let resizeStartWidth = 0;
    let resizeCursorSnapshot = "";
    let resizeUserSelectSnapshot = "";

    function stopDragging(event) {
      if (dragPointerId === null) return;
      if (event && dragPointerId !== event.pointerId) return;
      try {
        if (event && toggle.hasPointerCapture(event.pointerId)) {
          toggle.releasePointerCapture(event.pointerId);
        }
      } catch { }
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
      } catch { }
    });

    toggle.addEventListener("pointermove", (event) => {
      if (dragPointerId !== event.pointerId) return;
      const delta = event.clientY - dragStartClientY;
      if (Math.abs(delta) < 6) return;
      const height = getViewportHeight();
      const safe = 72;
      const nextTop = clamp(dragStartTop + delta, safe, height - safe);
      toggle.style.top = `${Math.round(nextTop)}px`;
      syncToggleWarningPosition();
      ignoreToggleClick = true;
    });

    toggle.addEventListener("pointerup", stopDragging);
    toggle.addEventListener("pointercancel", stopDragging);

    function setResizeInteraction(active) {
      const body = document.body;
      if (active) {
        resizeCursorSnapshot = document.documentElement.style.cursor;
        resizeUserSelectSnapshot = body ? body.style.userSelect : "";
        document.documentElement.style.cursor = "ew-resize";
        if (body) body.style.userSelect = "none";
        resizeHandle.classList.add("dragging");
        return;
      }
      document.documentElement.style.cursor = resizeCursorSnapshot;
      if (body) body.style.userSelect = resizeUserSelectSnapshot;
      resizeHandle.classList.remove("dragging");
    }

    function updatePanelWidth(width, { persist = false } = {}) {
      setPreferredPanelWidth(width, { persist });
      applyPanelWidth();
    }

    function stopResizing(event) {
      if (resizePointerId === null) return;
      if (event && resizePointerId !== event.pointerId) return;
      try {
        if (event && resizeHandle.hasPointerCapture(event.pointerId)) {
          resizeHandle.releasePointerCapture(event.pointerId);
        }
      } catch { }
      resizePointerId = null;
      setResizeInteraction(false);
      persistPanelWidth();
    }

    resizeHandle.addEventListener("pointerdown", (event) => {
      if (!isOpen || !isPanelResizable()) return;
      if (typeof event.button === "number" && event.button !== 0) return;
      event.preventDefault();
      resizePointerId = event.pointerId;
      resizeStartClientX = event.clientX;
      resizeStartWidth = panel.getBoundingClientRect().width || getAppliedPanelWidth();
      setResizeInteraction(true);
      try {
        resizeHandle.setPointerCapture(event.pointerId);
      } catch { }
    });

    resizeHandle.addEventListener("pointermove", (event) => {
      if (resizePointerId !== event.pointerId) return;
      const delta = resizeStartClientX - event.clientX;
      if (Math.abs(delta) < 4) return;
      event.preventDefault();
      updatePanelWidth(resizeStartWidth + delta);
    });

    resizeHandle.addEventListener("pointerup", stopResizing);
    resizeHandle.addEventListener("pointercancel", stopResizing);
    resizeHandle.addEventListener("keydown", (event) => {
      if (!isOpen || !isPanelResizable()) return;
      let nextWidth = null;
      if (event.key === "ArrowLeft") {
        nextWidth = getAppliedPanelWidth() + PANEL_RESIZE_STEP;
      } else if (event.key === "ArrowRight") {
        nextWidth = getAppliedPanelWidth() - PANEL_RESIZE_STEP;
      } else if (event.key === "Home") {
        nextWidth = getPanelMaxWidth();
      } else if (event.key === "End") {
        nextWidth = getPanelMinWidth();
      }
      if (nextWidth === null) return;
      event.preventDefault();
      updatePanelWidth(nextWidth, { persist: true });
    });

    scrim.addEventListener("click", () => {
      if (isOpen) togglePanel();
    });

    // ─── Message Rendering ──────────────────────────────────────────────────

    function isResumeErrorMessage(msg) {
      return Boolean(msg && msg.role === "assistant" && msg.kind === "resume_error" && typeof msg.resumeQuery === "string");
    }

    function upsertResumeErrorMessage(query, content) {
      const resumeQuery = String(query || "").trim();
      if (!resumeQuery) return;
      const message = {
        role: "assistant",
        kind: "resume_error",
        resumeQuery,
        content: content || "Something interrupted execution before it finished. Resume to retry your previous request.",
      };
      const latest = state.messages[state.messages.length - 1];
      if (isResumeErrorMessage(latest)) {
        state.messages[state.messages.length - 1] = { ...latest, ...message };
        return;
      }
      state.messages.push(message);
    }

    function renderScreenShareBar(container) {
      const sharing = isScreenShareActive();
      const asking = Boolean(screenSharePromiseResolve);
      if (!sharing && !asking) return;
      const prompt = document.createElement("div");
      prompt.className = "cta-widget-screen-prompt" + (sharing ? " sharing" : "");
      const dot = document.createElement("span");
      dot.className = "cta-widget-screen-prompt-dot";
      prompt.appendChild(dot);
      const body = document.createElement("span");
      body.className = "cta-widget-screen-prompt-body";
      if (sharing) {
        body.textContent = "Sharing this tab";
      } else {
        body.textContent = "Share this tab for a clearer view";
        if (screenShareCountdown > 0) {
          body.appendChild(document.createElement("br"));
          const countdown = document.createElement("span");
          countdown.className = "cta-widget-screen-prompt-countdown";
          countdown.textContent = "Continuing in " + screenShareCountdown + "s";
          body.appendChild(countdown);
        }
      }
      prompt.appendChild(body);
      if (sharing) {
        const stopBtn = document.createElement("button");
        stopBtn.type = "button";
        stopBtn.className = "cta-widget-screen-prompt-link";
        stopBtn.textContent = "Stop";
        stopBtn.addEventListener("click", () => {
          stopScreenShare();
          renderMessages();
        });
        prompt.appendChild(stopBtn);
      } else {
        const shareBtn = document.createElement("button");
        shareBtn.type = "button";
        shareBtn.className = "cta-widget-screen-prompt-btn primary";
        shareBtn.textContent = "Share";
        shareBtn.addEventListener("click", async () => {
          shareBtn.disabled = true;
          clearScreenShareCountdown();
          const ok = await requestScreenShare();
          if (screenSharePromiseResolve) {
            screenSharePromiseResolve(ok);
            screenSharePromiseResolve = null;
          }
          renderMessages();
        });
        prompt.appendChild(shareBtn);
        const skipBtn = document.createElement("button");
        skipBtn.type = "button";
        skipBtn.className = "cta-widget-screen-prompt-link";
        skipBtn.textContent = "Skip";
        skipBtn.addEventListener("click", () => {
          clearScreenShareCountdown();
          screenShareDismissed = true;
          if (screenSharePromiseResolve) {
            screenSharePromiseResolve(false);
            screenSharePromiseResolve = null;
          }
          renderMessages();
        });
        prompt.appendChild(skipBtn);
      }
      container.appendChild(prompt);
    }

    function renderMessages() {
      if (state.messages.length === 0 && !frontendActivity) {
        messagesEl.innerHTML = "";
        renderScreenShareBar(messagesEl);
        const emptyTitle = widgetEmptyTitle.trim();
        const emptyDescription = widgetEmptyDescription.trim();
        const empty = document.createElement("div");
        empty.className = "cta-widget-empty";
        empty.innerHTML = `
          <div class="cta-widget-empty-icon">${getBrandIconMarkup()}</div>
          ${emptyTitle ? `<h3>${escapeHtml(emptyTitle)}</h3>` : ""}
          ${emptyDescription ? `<p>${escapeHtml(emptyDescription)}</p>` : ""}
        `;
        messagesEl.appendChild(empty);
        return;
      }

      messagesEl.innerHTML = "";

      renderScreenShareBar(messagesEl);

      state.messages.forEach((msg, index) => {
        const bubble = document.createElement("div");
        bubble.className = `cta-widget-message ${msg.role}`;
        if (msg.role === "assistant") {
          bubble.innerHTML = renderMarkdown(msg.content);
          if (isResumeErrorMessage(msg)) {
            const actions = document.createElement("div");
            actions.className = "cta-widget-message-actions";
            const resumeButton = document.createElement("button");
            resumeButton.type = "button";
            resumeButton.className = "cta-widget-resume";
            resumeButton.textContent = "Resume";
            const canResume = index === state.messages.length - 1 && !isLoading && !widgetHidden;
            resumeButton.disabled = !canResume;
            resumeButton.addEventListener("click", () => {
              if (!canResume) return;
              sendMessage(msg.resumeQuery, { skipUserEcho: true });
            });
            actions.appendChild(resumeButton);
            bubble.appendChild(actions);
          }
        } else {
          bubble.textContent = msg.content;
        }
        messagesEl.appendChild(bubble);
      });

      if (frontendActivity) {
        const activity = document.createElement("div");
        activity.className = "cta-widget-activity";
        const header = document.createElement("div");
        header.className = "cta-widget-activity-header";
        const title = document.createElement("span");
        title.textContent = frontendActivity.title || "Applying changes";
        const status = document.createElement("span");
        status.className = "cta-widget-activity-status";
        status.textContent =
          frontendActivity.status === "done" ? "Done" : frontendActivity.status === "error" ? "Needs attention" : "Working";
        header.appendChild(title);
        header.appendChild(status);
        activity.appendChild(header);
        if (frontendActivity.steps && frontendActivity.steps.length > 0) {
          const list = document.createElement("div");
          list.className = "cta-widget-activity-list";
          frontendActivity.steps.forEach((step) => {
            const row = document.createElement("div");
            row.className = "cta-widget-activity-step";
            row.dataset.status = step.status || "pending";
            row.textContent = step.label || `Step ${step.index + 1}`;
            list.appendChild(row);
          });
          activity.appendChild(list);
        }
        messagesEl.appendChild(activity);
      }

      if (isLoading) {
        const loading = document.createElement("div");
        loading.className = "cta-widget-loading";
        loading.innerHTML = "<span></span><span></span><span></span>";
        messagesEl.appendChild(loading);
      }

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function clearScreenShareCountdown() {
      if (screenShareCountdownInterval) {
        clearInterval(screenShareCountdownInterval);
        screenShareCountdownInterval = null;
      }
      screenShareCountdown = 0;
    }

    async function ensureScreenShare(signal) {
      if (isScreenShareActive()) return true;
      if (screenShareDismissed) return false;
      if (screenSharePromiseResolve) return false;
      return new Promise((resolve) => {
        screenSharePromiseResolve = resolve;
        clearScreenShareCountdown();
        screenShareCountdown = Math.ceil(SCREEN_SHARE_TIMEOUT_MS / 1000);
        screenShareCountdownInterval = setInterval(() => {
          screenShareCountdown = Math.max(0, screenShareCountdown - 1);
          renderMessages();
        }, 1000);
        renderMessages();
        const timeout = setTimeout(() => {
          clearScreenShareCountdown();
          if (screenSharePromiseResolve === resolve) {
            screenSharePromiseResolve = null;
            renderMessages();
            resolve(false);
          }
        }, SCREEN_SHARE_TIMEOUT_MS);
        const onAbort = () => {
          clearTimeout(timeout);
          clearScreenShareCountdown();
          if (screenSharePromiseResolve === resolve) {
            screenSharePromiseResolve = null;
            renderMessages();
          }
          resolve(false);
        };
        if (signal) {
          if (signal.aborted) {
            clearTimeout(timeout);
            clearScreenShareCountdown();
            screenSharePromiseResolve = null;
            renderMessages();
            resolve(false);
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    }

    async function captureScreenshot(signal) {
      const shared = await ensureScreenShare(signal);
      if (!shared || !isScreenShareActive()) return null;
      return captureScreenFrame();
    }

    const frontendUi = {
      setActivity: setFrontendActivity,
      scheduleClear: scheduleFrontendActivityClear,
      primeWarning: primeFrontendWarning,
      clearWarningSoon: () => scheduleFrontendWarningClear(FRONTEND_WARNING_HOLD_MS),
      captureScreenshot,
    };

    screenShareEndedCallback = () => renderMessages();

    function setLoading(loading) {
      isLoading = loading;
      syncSendButton();
      updateMicState();
      renderMessages();
    }

    // ─── Voice Input & Recording ─────────────────────────────────────────────

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
      syncSendButton();
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

    // ─── Configuration & Authentication ──────────────────────────────────────

    function getConfigString(data, key) {
      return typeof data[key] === "string" && data[key].trim() ? data[key].trim() : null;
    }

    function getOptionalConfigString(data, key) {
      return typeof data[key] === "string" ? data[key].trim() : null;
    }

    function applyRemoteConfig(data) {
      if (widgetHidden) return;
      if (!data || typeof data !== "object") return;
      if (shouldHideWidget(data)) {
        hideWidget();
        return;
      }
      headerConfig = data.headers || {};
      widgetRefreshEndpointPath = data.widgetRefreshEndpointPath || "/widget-token";
      widgetTitle = getConfigString(data, "widgetTitle") || widgetTitle;
      widgetIconUrl = getConfigString(data, "widgetIconUrl");
      if (data.widgetBehavior === "push" || data.widgetBehavior === "overlay") {
        widgetBehavior = data.widgetBehavior;
      }
      const emptyTitle = getOptionalConfigString(data, "widgetEmptyTitle");
      const emptyDescription = getOptionalConfigString(data, "widgetEmptyDescription");
      if (emptyTitle !== null) widgetEmptyTitle = emptyTitle;
      if (emptyDescription !== null) widgetEmptyDescription = emptyDescription;
      widgetInputPlaceholder = getConfigString(data, "widgetInputPlaceholder") || widgetInputPlaceholder;
      if (typeof data.securityDisclosureEnabled === "boolean") {
        securityDisclosureEnabled = data.securityDisclosureEnabled;
      }
      applyWidgetUiConfig();
    }

    async function fetchConfig() {
      const data = await fetchWidgetConfig(apiUrl, config.agentId);
      if (data) {
        applyRemoteConfig(data);
      }
    }

    function ensureConfigLoaded() {
      if (!configPromise) {
        configPromise = initialConfigData ? Promise.resolve(applyRemoteConfig(initialConfigData)) : fetchConfig();
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

    async function postWidgetChat(body, signal) {
      await ensureConfigLoaded();
      const makeRequest = () =>
        fetchWithTimeout(`${apiUrl}/widget/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(widgetAuthToken ? { Authorization: `Bearer ${widgetAuthToken}` } : {}),
          },
          body: JSON.stringify(body),
          signal,
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

    // ─── Chat & Messaging ───────────────────────────────────────────────────

    function setUnread(nextHasUnread) {
      hasUnread = Boolean(nextHasUnread);
      toggle.classList.toggle("has-unread", hasUnread);
      syncToggleAriaLabel();
    }

    function playUnreadPulse() {
      toggle.classList.remove("unread-pulse");
      void toggle.offsetWidth;
      toggle.classList.add("unread-pulse");
    }

    function isActionToolType(type) {
      return type === "frontend" || type === "js_exec";
    }

    async function runToolCalls(toolCalls, signal) {
      throwIfAborted(signal);
      const hasFrontendActions = toolCalls.some(function (call) { return isActionToolType(resolveToolType(call)); });
      let didPrimeWarning = false;
      try {
        const hasOnlyNonFrontend = toolCalls.every(function (call) {
          var t = resolveToolType(call);
          return t === "backend" || t === "read_page" || t === "find_elements";
        });
        if (hasOnlyNonFrontend) {
          return Promise.all(toolCalls.map((tc) => executeToolCall(tc, config.baseUrl, headerConfig, frontendUi, signal)));
        }
        const results = [];
        for (const call of toolCalls) {
          if (!didPrimeWarning && isActionToolType(resolveToolType(call)) && typeof frontendUi.primeWarning === "function") {
            await frontendUi.primeWarning(signal);
            didPrimeWarning = true;
          }
          results.push(await executeToolCall(call, config.baseUrl, headerConfig, frontendUi, signal));
        }
        return results;
      } finally {
        if (hasFrontendActions && typeof frontendUi.clearWarningSoon === "function") {
          frontendUi.clearWarningSoon();
        }
      }
    }

    async function sendMessage(text, options = {}) {
      const messageText = String(text || "").trim();
      if (!messageText || isLoading || widgetHidden) return;
      refMap.clear();
      const runEpoch = chatEpoch;
      const isRunStale = () => runEpoch !== chatEpoch;

      const skipUserEcho = options && options.skipUserEcho === true;
      if (!skipUserEcho) {
        state.messages.push({ role: "user", content: messageText });
        saveState(state);
      }
      renderMessages();
      setLoading(true);
      const runAbortController = new AbortController();
      activeRunAbortController = runAbortController;

      let didReceiveAssistant = false;
      let shouldHide = false;

      state.activeQuery = messageText;
      saveState(state);

      try {
        const payload = {
          agentId: config.agentId,
          conversationId: state.conversationId,
          message: messageText,
        };

        let response = await postWidgetChat(payload, runAbortController.signal);
        if (isRunStale()) return;

        if (!response.ok) {
          throw new Error("Chat request failed");
        }

        let data = await response.json();
        if (isRunStale()) return;
        state.conversationId = data.conversationId;
        saveState(state);

        shouldHide = shouldHideWidget(data);
        if (!shouldHide) {
          const MAX_ITERATIONS = 25;
          let iterations = 0;
          while (!data.done && !shouldHide) {
            if (isRunStale()) return;
            if (++iterations > MAX_ITERATIONS) {
              throw new Error("Too many tool call iterations");
            }

            if (data.toolCalls && data.toolCalls.length > 0) {
              const toolResults = await runToolCalls(data.toolCalls, runAbortController.signal);
              if (isRunStale()) return;

              response = await postWidgetChat({
                agentId: config.agentId,
                conversationId: state.conversationId,
                toolResults,
              }, runAbortController.signal);
              if (isRunStale()) return;

              if (!response.ok) {
                throw new Error("Tool result request failed");
              }

              data = await response.json();
              if (isRunStale()) return;
              shouldHide = shouldHideWidget(data);
            } else {
              break;
            }
          }
        }

        if (!shouldHide && data.messages && data.messages.length > 0) {
          if (isRunStale()) return;
          for (const msg of data.messages) {
            state.messages.push({ role: msg.role, content: msg.content });
            if (msg.role === "assistant") {
              didReceiveAssistant = true;
            }
          }
        }

        if (!shouldHide) {
          saveState(state);
        }
      } catch (error) {
        if (!shouldHide && !isRunStale()) {
          const isStopped = isAbortError(error);
          if (!isNavigatingAway) {
            upsertResumeErrorMessage(
              messageText,
              isStopped
                ? "Execution stopped before it finished. Resume to continue from your previous request."
                : "Something went wrong while executing this request. Resume to try your previous request again."
            );
            didReceiveAssistant = true;
            saveState(state);
          }
        }
      } finally {
        if (activeRunAbortController === runAbortController) {
          activeRunAbortController = null;
        }
        setLoading(false);
        state.activeQuery = null;
        if (!isNavigatingAway) saveState(state);
      }
      if (isRunStale()) return;

      if (shouldHide) {
        hideWidget();
        return;
      }

      if (!isOpen && didReceiveAssistant) {
        setUnread(true);
        playUnreadPulse();
      }
    }

    // ─── Panel Management ──────────────────────────────────────────────────

    function openPanel() {
      if (isOpen) return;
      isOpen = true;
      setUnread(false);
      panel.classList.add("open");
      scrim.classList.add("open");
      toggle.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      applyPanelWidth();
      syncToggleAriaLabel();
      inputEl.focus();
      syncSendButton();
      syncFrontendWarningUi();
      renderMessages();
    }

    function closePanel({ restoreLauncherFocus = true } = {}) {
      if (!isOpen) return;
      stopResizing();
      isOpen = false;
      isSecurityPanelOpen = false;
      securityPanelEl.classList.remove("open");
      panel.classList.remove("open");
      scrim.classList.remove("open");
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      applyPanelWidth();
      syncToggleAriaLabel();
      closeMicMenu();
      stopRecording();
      clearHighlight();
      syncSendButton();
      syncFrontendWarningUi();
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
      chatEpoch += 1;
      if (isLoading) {
        stopCurrentExecution();
      }
      state.messages = [];
      state.conversationId = null;
      saveState(state);
      setUnread(false);
      clearFrontendActivity();
      clearFrontendWarning();
      screenShareDismissed = false;
      clearScreenShareCountdown();
      if (screenSharePromiseResolve) {
        screenSharePromiseResolve(false);
        screenSharePromiseResolve = null;
      }
      renderMessages();
    }

    // ─── Event Binding ──────────────────────────────────────────────────────

    toggle.addEventListener("click", async () => {
      if (ignoreToggleClick || widgetHidden) return;
      if (!isOpen) {
        await fetchConfig();
      }
      if (widgetHidden) return;
      togglePanel();
    });
    toggle.addEventListener("animationend", (event) => {
      if (event.animationName === "cta-widget-unread-pulse") {
        toggle.classList.remove("unread-pulse");
      }
    });
    closeEl.addEventListener("click", togglePanel);
    newChatEl.addEventListener("click", startNewChat);
    securityBtnEl.addEventListener("click", () => {
      isSecurityPanelOpen = true;
      securityPanelEl.classList.add("open");
    });
    securityBackEl.addEventListener("click", () => {
      isSecurityPanelOpen = false;
      securityPanelEl.classList.remove("open");
    });
    document.addEventListener("keydown", (event) => {
      if (!isOpen) return;
      if (event.key !== "Escape") return;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const isFromWidget = path.includes(panel) || path.includes(root);
      if (isFromWidget) {
        event.stopPropagation();
      }
      if (isSecurityPanelOpen) {
        isSecurityPanelOpen = false;
        securityPanelEl.classList.remove("open");
        return;
      }
      closePanel({ restoreLauncherFocus: false });
    });
    micEl.addEventListener("click", () => {
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
      if (isLoading) {
        stopCurrentExecution();
        return;
      }
      sendMessage(inputEl.value);
      inputEl.value = "";
      syncSendButton();
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
        syncSendButton();
      }
    });

    ensureConfigLoaded();
    refreshDevices(false);
    updateMicState();
    applyWidgetUiConfig();

    if (state.interruptedByNavigation && state.activeQuery) {
      state.interruptedByNavigation = false;
      saveState(state);
      setTimeout(() => {
        openPanel();
        sendMessage(state.activeQuery, { skipUserEcho: true });
      }, 500);
    } else {
      state.interruptedByNavigation = false;
      state.activeQuery = null;
      saveState(state);
    }

    return root;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════════════════════

  async function init() {
    try {
      const config = getScriptData();
      if (!config || !config.agentId) {
        console.warn("[Warpy] Missing data-agent-id attribute");
        return;
      }

      const apiUrl = resolveApiUrl();
      const initialConfigData = await fetchWidgetConfig(apiUrl, config.agentId, 2500);
      if (initialConfigData && shouldHideWidget(initialConfigData)) {
        const existing = document.getElementById(WIDGET_CONTAINER_ID);
        if (existing) {
          existing.style.display = "none";
          existing.setAttribute("aria-hidden", "true");
        }
        return;
      }

      if (document.getElementById(WIDGET_CONTAINER_ID)) {
        return;
      }

      const host = document.createElement("div");
      host.id = WIDGET_CONTAINER_ID;
      const shadowRoot = host.attachShadow({ mode: "open" });
      shadowRoot.appendChild(createStyles());
      shadowRoot.appendChild(createWidget(config, initialConfigData));
      observeTheme(host);
      document.body.appendChild(host);
    } catch { }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
