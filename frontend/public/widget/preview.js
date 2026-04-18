const PREVIEW_UPDATE_EVENT = "warpy:preview:update";

const defaultConfig = {
  widgetTitle: "Warpy",
  widgetIconUrl: null,
  widgetAppearanceMode: "custom",
  widgetTheme: null,
  widgetBehavior: "overlay",
  widgetEmptyTitle: "What would you like to do?",
  widgetEmptyDescription: "Ask a question, request help, or describe what you want to get done.",
  widgetInputPlaceholder: "Ask Warpy…",
  widgetSuggestionsEnabled: true,
  widgetStarterSuggestions: ["Show recent invoices", "Create a refund", "Summarize approvals"],
  securityDisclosureEnabled: true,
  requireSignedWidgetToken: false,
  widgetRefreshEndpointPath: "/widget-token",
  auth: { mode: "none" },
  headers: {},
  sendCookiesWithRequests: false,
  isWidgetHidden: false,
  actionsRemaining: 999,
};

const previewBootstrap = {
  enabled: true,
  apiUrl: "",
  config: {
    agentId: "preview-widget",
    baseUrl: "",
  },
  remoteConfig: defaultConfig,
  scene: "launcher",
  colorScheme: "light",
};

window.__WARPY_WIDGET_PREVIEW__ = previewBootstrap;

function applyPreviewScheme() {
  document.documentElement.dataset.previewScheme = previewBootstrap.colorScheme === "dark" ? "dark" : "light";
}

function dispatchPreviewUpdate(detail) {
  window.dispatchEvent(new CustomEvent(PREVIEW_UPDATE_EVENT, { detail }));
}

window.addEventListener("message", (event) => {
  const payload = event.data;
  if (!payload || payload.type !== "warpy-widget-preview:update") return;

  if (payload.config && typeof payload.config === "object") {
    previewBootstrap.remoteConfig = payload.config;
  }
  if (payload.scene && typeof payload.scene === "string") {
    previewBootstrap.scene = payload.scene;
  }
  if (payload.previewColorScheme === "dark" || payload.previewColorScheme === "light") {
    previewBootstrap.colorScheme = payload.previewColorScheme;
    applyPreviewScheme();
  }

  dispatchPreviewUpdate(payload);
});

applyPreviewScheme();

const script = document.createElement("script");
script.src = "/widget/agent.js";
document.body.appendChild(script);
