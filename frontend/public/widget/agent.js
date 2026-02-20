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
    return normalized === "frontend_actions" ? "frontend" : normalized;
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
        monitorTypeSurface: "exclude",
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

  function resolveSelectorTarget(selector, root) {
    if (!selector) return null;
    const trimmed = String(selector).trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    const base = root || document;
    if (lower.startsWith("text=")) {
      return findElementByText(trimmed.slice(5), base);
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

  function collectCandidateElements(root, tokens, maxElements, includeOffscreen, selectorHints) {
    const elements = collectAllInteractiveElements(root, INTERACTIVE_SELECTOR);
    const descriptors = [];
    for (const el of elements) {
      if (!isElementVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (!includeOffscreen && !isRectInViewport(rect, 120)) continue;
      const descriptor = getElementDescriptor(el, true);
      const haystack = normalizeText(
        [
          descriptor.text,
          descriptor.label,
          descriptor.ariaLabel,
          descriptor.placeholder,
          descriptor.name,
          descriptor.id,
          descriptor.role,
          descriptor.tag,
        ].join(" ")
      );
      descriptor._score = scoreText(haystack, tokens);
      descriptor._rank = isRectInViewport(rect, 0) ? 1 : 0;
      descriptors.push(descriptor);
    }
    const hints = Array.isArray(selectorHints) ? selectorHints : [];
    for (const hint of hints) {
      const target = resolveSelectorTarget(String(hint), root);
      if (target && isElementVisible(target)) {
        const descriptor = getElementDescriptor(target, true);
        descriptor._score = Math.max(descriptor._score || 0, tokens.length ? tokens.length + 1 : 1);
        descriptor._rank = 2;
        descriptors.push(descriptor);
      }
    }
    const unique = new Map();
    for (const item of descriptors) {
      const key = item.selector || `${item.tag}-${item.id}-${item.name}-${item.text}`;
      if (!unique.has(key)) {
        unique.set(key, item);
      }
    }
    const list = Array.from(unique.values());
    list.sort((a, b) => (b._score || 0) - (a._score || 0) || (b._rank || 0) - (a._rank || 0));
    const preferred = tokens.length ? list.filter((item) => (item._score || 0) > 0) : list;
    const selected = preferred.slice(0, maxElements);
    if (selected.length < maxElements) {
      for (const item of list) {
        if (selected.length >= maxElements) break;
        if (!selected.includes(item)) {
          selected.push(item);
        }
      }
    }
    return selected.map(({ _score, _rank, ...rest }) => rest);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Frontend Context Collection
  // ═══════════════════════════════════════════════════════════════════════════

  // Infer element purpose from attributes and content
  function inferElementPurpose(el) {
    const tag = el.tag || "";
    const type = el.type || "";
    const text = (el.text || "").toLowerCase();
    const label = (el.label || "").toLowerCase();
    const name = (el.name || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const role = el.role || "";

    // Check common patterns
    if (type === "submit" || text.includes("submit") || label.includes("submit")) return "submit button";
    if (type === "search" || name.includes("search") || id.includes("search")) return "search input";
    if (type === "password" || name.includes("password")) return "password input";
    if (type === "email" || name.includes("email")) return "email input";
    if (text.includes("login") || text.includes("sign in")) return "login button";
    if (text.includes("logout") || text.includes("sign out")) return "logout button";
    if (text.includes("save") || label.includes("save")) return "save button";
    if (text.includes("cancel") || label.includes("cancel")) return "cancel button";
    if (text.includes("close") || label.includes("close")) return "close button";
    if (text.includes("delete") || text.includes("remove")) return "delete button";
    if (text.includes("add") || text.includes("create") || text.includes("new")) return "add button";
    if (text.includes("edit") || text.includes("modify")) return "edit button";
    if (text.includes("filter") || label.includes("filter")) return "filter control";
    if (text.includes("sort") || label.includes("sort")) return "sort control";
    if (role === "checkbox" || type === "checkbox") return "checkbox";
    if (role === "switch") return "toggle switch";
    if (tag === "select") return "dropdown";
    if (tag === "textarea") return "text area";
    if (tag === "a") return "link";
    if (tag === "button" || role === "button") return "button";
    if (tag === "input") return type ? `${type} input` : "input";
    return tag || "element";
  }

  // Generate selector recommendations for top elements
  function generateSelectorRecommendations(elements) {
    return elements.slice(0, 10).map((el) => {
      const purpose = inferElementPurpose(el);
      const recommendation = {
        purpose,
        preferred: el.selector || el.selectors?.[0] || "",
        alternatives: (el.selectors || []).slice(1, 3),
      };
      // Add text/label shortcuts if available
      if (el.text && el.text.length <= 30 && !el.text.includes("\n")) {
        recommendation.textShortcut = `text=${el.text}`;
      }
      if (el.label && el.label.length <= 30) {
        recommendation.labelShortcut = `label=${el.label}`;
      }
      if (el.role) {
        recommendation.roleShortcut = `role=${el.role}`;
      }
      return recommendation;
    });
  }

  function collectFrontendContext(request) {
    const goal = typeof request.goal === "string" ? request.goal : "";
    const scope = typeof request.scope === "string" ? request.scope : null;
    const includeDom = request.includeDom !== false;
    const includeOffscreen = request.includeOffscreen === true;
    const maxElements = clampInt(request.maxElements || 60, 20, 160);
    const selectorHints = Array.isArray(request.selectorHints) ? request.selectorHints : [];
    const root = resolveScopeRoot(scope);
    const tokens = tokenizeGoal(goal, selectorHints);
    const elements = includeDom ? collectCandidateElements(root, tokens, maxElements, includeOffscreen, selectorHints) : [];
    const headings = includeDom ? collectHeadings(root) : [];
    const active = document.activeElement && document.activeElement !== document.body ? getElementDescriptor(document.activeElement, false) : null;
    const suggestedSelectors = includeDom ? generateSelectorRecommendations(elements) : [];
    return {
      kind: "frontend_context",
      goal,
      scope,
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      elements,
      headings,
      activeElement: active,
      suggestedSelectors,
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

  function findElementByText(text, root) {
    const target = normalizeText(text);
    if (!target) return null;
    const base = root || document;
    const elements = Array.from(base.querySelectorAll(INTERACTIVE_SELECTOR));
    let best = null;
    let bestScore = Infinity;
    for (const el of elements) {
      if (!isElementVisible(el)) continue;
      const label = normalizeText(getAssociatedLabelText(el));
      const content = normalizeText(getElementText(el));
      const aria = normalizeText(getAriaLabel(el));
      const haystack = [label, content, aria].filter(Boolean).join(" ");
      if (!haystack) continue;
      if (haystack === target) return el;
      if (haystack.includes(target)) {
        const score = Math.abs(haystack.length - target.length);
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
    }
    return best;
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
    return safeQuerySelector(base, `[role="${cssEscape(target)}"]`);
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
    return { ...action, action: String(name).trim().toLowerCase() };
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
    if (name === "wait") {
      const delay = clampInt(action.delayMs || action.ms || 500, 0, 10000);
      await sleep(delay, signal);
      return;
    }
    if (name === "waitfor" || name === "wait_for") {
      const selector = action.selector || (action.text ? `text=${action.text}` : action.value ? String(action.value) : "");
      const el = selector ? await waitForElement(selector, { timeoutMs: action.timeoutMs }, signal) : null;
      if (!el) throw createError("Element not found", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
      return;
    }
    if (name === "waitfortext" || name === "wait_for_text") {
      const ok = await waitForText(action.text || action.value || "", { timeoutMs: action.timeoutMs }, signal);
      if (!ok) throw createError("Text not found", "TIMEOUT", "WAIT_AND_RETRY");
      return;
    }
    if (name === "wait_for_stable" || name === "waitforstable") {
      const selector = action.selector || action.target || "";
      await waitForStable(selector || null, {
        timeoutMs: action.timeoutMs,
        stabilityMs: action.stabilityMs || 300,
      }, signal);
      return;
    }
    if (name === "navigate") {
      const url = action.url || action.value;
      if (!url) throw createError("Missing url", "SELECTOR_INVALID", null);
      window.location.assign(String(url));
      return;
    }
    if (name === "scroll") {
      const selector = action.selector || action.target || "";
      const behavior = action.behavior || "auto";
      const x = Number(action.x || 0);
      const y = Number(action.y || action.deltaY || 0);
      if (selector) {
        const target = resolveSelectorTarget(selector, document);
        if (!target) throw createError("Element not found", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
        target.scrollBy({ left: x, top: y, behavior });
      } else {
        window.scrollBy({ left: x, top: y, behavior });
      }
      return;
    }
    if (name === "scroll_into_view" || name === "scrollintoview") {
      const selector = action.selector || action.target || "";
      const target = resolveSelectorTarget(selector, document);
      if (!target) throw createError("Element not found", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
      target.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
      return;
    }

    const selector = action.selector || action.target || (action.text ? `text=${action.text}` : action.role ? `role=${action.role}` : "");
    const timeoutMs = action.timeoutMs;
    let el = selector ? resolveSelectorTarget(selector, document) : null;
    if (!el && selector && timeoutMs) {
      el = await waitForElement(selector, { timeoutMs }, signal);
    }
    if (!el && !selector && (name === "press" || name === "type" || name === "input" || name === "clear")) {
      el = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    }
    if (!el) {
      // This is the only hard blocker - we genuinely can't proceed without an element
      throw createError("Element not found", "ELEMENT_NOT_FOUND", "RESCAN_WITH_SCOPE");
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
      dispatchPointerEvent(el, "pointerdown", point);
      dispatchMouseEvent(el, "mousedown", point);
      focusElement(el);
      dispatchPointerEvent(el, "pointerup", point);
      dispatchMouseEvent(el, "mouseup", point);
      dispatchMouseEvent(el, "click", point);
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
      const source = fromSelector ? resolveSelectorTarget(fromSelector, document) : el;
      const target = toSelector ? resolveSelectorTarget(toSelector, document) : null;
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

  async function executeFrontendContext(toolCall, ui, signal) {
    throwIfAborted(signal);
    const request = toolCall && toolCall.context && typeof toolCall.context === "object" ? toolCall.context : toolCall || {};
    const title = toolCall.goal || request.goal || "Reviewing the page";
    if (ui && typeof ui.setActivity === "function") {
      ui.setActivity({ title, status: "running", steps: [] });
    }
    try {
      let screenshot = null;
      if (ui && typeof ui.captureScreenshot === "function") {
        screenshot = await ui.captureScreenshot(signal);
      }
      throwIfAborted(signal);
      const context = collectFrontendContext(request);
      if (screenshot) {
        context.screenshot = screenshot;
      }
      if (ui && typeof ui.setActivity === "function") {
        ui.setActivity({ title, status: "done", steps: [] });
        if (typeof ui.scheduleClear === "function") {
          ui.scheduleClear(900);
        }
      }
      return { id: toolCall.id, statusCode: 200, body: context };
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
      return { id: toolCall.id, statusCode: 500, body: null, error: error.message || "Frontend context failed" };
    }
  }

  async function executeFrontendActions(toolCall, ui, signal) {
    throwIfAborted(signal);
    const actions = Array.isArray(toolCall.actions) ? toolCall.actions : [];
    const goal = toolCall.goal || "Applying changes";
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
      try {
        await executeWithRetry(() => runFrontendAction(normalized, signal), retryCount, retryDelayMs, signal);
        results.push({
          index: i,
          action: normalized.action,
          selector: normalized.selector || normalized.target || null,
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
          selector: normalized.selector || normalized.target || null,
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
    if (type === "frontend_context") {
      return executeFrontendContext(toolCall, ui, signal);
    }
    if (type === "frontend") {
      return executeFrontendActions(toolCall, ui, signal);
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
        width: 44px;
        height: 44px;
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

      .cta-widget-toggle svg,
      .cta-widget-toggle img {
        width: 22px;
        height: 22px;
      }

      .cta-widget-toggle img {
        border-radius: 6px;
        object-fit: contain;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
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

      .cta-widget-toggle-warning {
        position: fixed;
        right: calc(68px + env(safe-area-inset-right, 0px));
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

      @media (max-width: 640px) {
        .cta-widget-panel {
          width: 100vw;
          border-radius: 0;
        }
      }

      .cta-widget-header {
        grid-area: header;
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 14px;
        padding-top: calc(10px + env(safe-area-inset-top, 0px));
        background: rgba(var(--cta-bg-rgb, 255, 255, 255), 0.85);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
      }

      .cta-widget-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .cta-widget-avatar {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--cta-bubble-assistant);
        border: 1px solid var(--cta-border-strong);
        flex-shrink: 0;
        position: relative;
      }

      .cta-widget-avatar svg,
      .cta-widget-avatar img {
        width: 18px;
        height: 18px;
      }

      .cta-widget-avatar svg {
        color: var(--cta-accent);
      }

      .cta-widget-avatar img {
        border-radius: 6px;
        object-fit: contain;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
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
        height: 32px;
        padding: 0 8px;
        background: transparent;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-size: 12px;
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
        background: var(--cta-surface-strong);
        display: flex;
        flex-direction: column;
        z-index: 10;
        transform: translateX(100%);
        transition: transform 240ms cubic-bezier(0.2, 0.9, 0.2, 1);
        backdrop-filter: blur(32px) saturate(180%);
        -webkit-backdrop-filter: blur(32px) saturate(180%);
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
        background: rgba(var(--cta-bg-rgb, 255, 255, 255), 0.85);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
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
        grid-row: 1 / -1;
        overflow-y: auto;
        min-height: 0;
        padding: 14px;
        padding-top: calc(66px + env(safe-area-inset-top, 0px));
        padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px));
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
        border: 1px solid var(--cta-border-strong);
      }

      .cta-widget-empty-icon svg,
      .cta-widget-empty-icon img {
        width: 28px;
        height: 28px;
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
        z-index: 2;
        padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
        background: rgba(var(--cta-bg-rgb, 255, 255, 255), 0.85);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
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

        .cta-widget-activity-step[data-status="running"]::before {
          animation: none !important;
        }
      }
    `;
    return style;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Widget Creation & Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  function createWidget(config, initialConfigData) {
    const apiUrl = resolveApiUrl();

    // ─── State ───────────────────────────────────────────────────────────────

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
        <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"/>
        <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"/>
        <path d="M18 14l.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5z"/>
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
    let widgetSubtitle = "Ready to act";
    let widgetIconUrl = null;
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
    toggle.innerHTML = DEFAULT_WIDGET_ICON;

    const toggleWarning = document.createElement("div");
    toggleWarning.className = "cta-widget-toggle-warning";
    toggleWarning.setAttribute("aria-live", "polite");

    const panel = document.createElement("div");
    panel.className = "cta-widget-panel";
    panel.id = "cta-widget-panel";
    panel.setAttribute("role", "dialog");
    toggle.setAttribute("aria-controls", panel.id);
    panel.innerHTML = `
      <div class="cta-widget-header">
        <div class="cta-widget-header-left">
          <div class="cta-widget-avatar">
            ${DEFAULT_WIDGET_ICON}
          </div>
          <div>
            <p class="cta-widget-title"></p>
            <p class="cta-widget-subtitle"></p>
          </div>
        </div>
        <div class="cta-widget-header-actions">
          <button class="cta-widget-security-btn" aria-label="Security & Privacy" title="Security & Privacy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </button>
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
    const closeEl = panel.querySelector(".cta-widget-close");
    const newChatEl = panel.querySelector(".cta-widget-new-chat");
    const micEl = panel.querySelector(".cta-widget-mic");
    const micSelectEl = panel.querySelector(".cta-widget-mic-select");
    const micMenuEl = panel.querySelector(".cta-widget-mic-menu");
    const voiceHintEl = panel.querySelector(".cta-voice-hint");
    const voiceErrorEl = panel.querySelector(".cta-voice-error");
    const frontWarningEl = panel.querySelector(".cta-widget-front-warning");
    const titleEl = panel.querySelector(".cta-widget-title");
    const subtitleEl = panel.querySelector(".cta-widget-subtitle");
    const avatarEl = panel.querySelector(".cta-widget-avatar");
    const securityBtnEl = panel.querySelector(".cta-widget-security-btn");
    const securityPanelEl = panel.querySelector(".cta-security-panel");
    const securityBackEl = panel.querySelector(".cta-security-back");
    const renderMarkdown = createMarkdownRenderer(() => renderMessages());

    // ─── UI Sync Helpers ────────────────────────────────────────────────────

    function getToggleAriaLabel() {
      return hasUnread ? `Open ${widgetTitle} (new message)` : `Open ${widgetTitle}`;
    }

    function getIconMarkup() {
      if (!widgetIconUrl) return DEFAULT_WIDGET_ICON;
      return `<img src="${escapeHtml(widgetIconUrl)}" alt="" aria-hidden="true" draggable="false" />`;
    }

    function syncToggleAriaLabel() {
      toggle.setAttribute("aria-label", getToggleAriaLabel());
    }

    function syncHeader() {
      panel.setAttribute("aria-label", widgetTitle);
      if (titleEl) titleEl.textContent = widgetTitle;
      if (subtitleEl) subtitleEl.textContent = widgetSubtitle;
      if (inputEl) inputEl.setAttribute("placeholder", widgetInputPlaceholder);
    }

    function syncIcons() {
      toggle.innerHTML = getIconMarkup();
      if (!avatarEl) return;
      const existingIcon = avatarEl.querySelector("svg, img");
      if (existingIcon) existingIcon.remove();
      avatarEl.insertAdjacentHTML("afterbegin", getIconMarkup());
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
        const empty = document.createElement("div");
        empty.className = "cta-widget-empty";
        empty.innerHTML = `
          <div class="cta-widget-empty-icon">${getIconMarkup()}</div>
          <h3>${escapeHtml(widgetEmptyTitle)}</h3>
          <p>${escapeHtml(widgetEmptyDescription)}</p>
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
      widgetSubtitle = getConfigString(data, "widgetSubtitle") || widgetSubtitle;
      widgetIconUrl = getConfigString(data, "widgetIconUrl");
      widgetEmptyTitle = getConfigString(data, "widgetEmptyTitle") || widgetEmptyTitle;
      widgetEmptyDescription = getConfigString(data, "widgetEmptyDescription") || widgetEmptyDescription;
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

    async function runToolCalls(toolCalls, signal) {
      throwIfAborted(signal);
      const hasFrontendActions = toolCalls.some((call) => resolveToolType(call) === "frontend");
      let didPrimeWarning = false;
      try {
        const hasOnlyBackend = toolCalls.every((call) => resolveToolType(call) === "backend");
        if (hasOnlyBackend) {
          return Promise.all(toolCalls.map((tc) => executeToolCall(tc, config.baseUrl, headerConfig, frontendUi, signal)));
        }
        const results = [];
        for (const call of toolCalls) {
          if (!didPrimeWarning && resolveToolType(call) === "frontend" && typeof frontendUi.primeWarning === "function") {
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
      inputEl.focus();
      syncSendButton();
      syncFrontendWarningUi();
      renderMessages();
    }

    function closePanel({ restoreLauncherFocus = true } = {}) {
      if (!isOpen) return;
      isOpen = false;
      isSecurityPanelOpen = false;
      securityPanelEl.classList.remove("open");
      panel.classList.remove("open");
      scrim.classList.remove("open");
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
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
