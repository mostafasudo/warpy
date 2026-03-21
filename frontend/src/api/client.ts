import type {
  ActivityConversationDetailResponse,
  ActivityConversationsResponse,
  ActivitySummaryResponse,
  AgentResponse,
  AgentWidgetConfigResponse,
  AgentWidgetConfigUpdate,
  AgentWidgetInstallResponse,
  AgentWidgetInstallUpdate,
  BillingCheckoutResponse,
  BillingPortalResponse,
  BillingSummaryResponse,
  ConfigResponse,
  CustomUserSystemPromptResponse,
  CustomUserSystemPromptUpdate,
  ToolPayload,
  ToolResponse,
  FeatureToolsResponse,
  FeaturePayload,
  FeatureTogglePayload,
  FeatureWithTools,
  FrontendCapabilityResponse,
  FrontendCapabilityUpdate,
  KnowledgeBaseStatusResponse,
  KnowledgeBaseToggle,
  KnowledgeDocumentContentResponse,
  KnowledgeDocumentListResponse,
  KnowledgeDocumentResponse,
  KnowledgeWebsiteCreate,
  KnowledgeWebsiteDetailResponse,
  KnowledgeWebsiteListResponse,
  KnowledgeWebsiteResponse,
  OnboardingStateResponse,
  PaginatedTools,
  UserRateLimitsResponse,
  UserRateLimitsUpdate,
  WidgetApiKeyCreateResponse,
  WidgetSecurityDraftUpdate,
  WidgetSecurityResponse,
} from "@/types";

type RequestOptions = Omit<RequestInit, "signal"> & {
  timeoutMs?: number;
};

let apiUrl = "http://localhost:8000";
let defaultTimeoutMs = 5000;

export const configureApiClient = (config: {
  apiUrl: string;
  apiTimeoutMs: number;
}) => {
  apiUrl = config.apiUrl;
  defaultTimeoutMs = config.apiTimeoutMs;
};

export const getApiUrl = (): string => apiUrl;

const getSessionToken = async (): Promise<string | null> => {
  const clerk = (
    globalThis as typeof globalThis & {
      Clerk?: {
        session?: { getToken?: () => Promise<string | null> | string | null };
      };
    }
  ).Clerk;
  const session = clerk?.session;
  const getter = session?.getToken;
  if (!getter || typeof getter !== "function") {
    return null;
  }
  const result = await getter();
  return result ?? null;
};

const createController = (timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(controller.abort.bind(controller), timeoutMs);
  return { controller, timeoutId };
};

const extractErrorMessage = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as
      | { detail?: unknown; message?: unknown; error?: unknown }
      | string
      | number
      | null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (typeof parsed.detail === "string") return parsed.detail;
      if (Array.isArray(parsed.detail)) {
        const parts = parsed.detail
          .map((item) => {
            if (!item) return "";
            if (typeof item === "string") return item;
            if (typeof (item as { msg?: unknown }).msg === "string") return (item as { msg: string }).msg;
            if (typeof (item as { message?: unknown }).message === "string") return (item as { message: string }).message;
            return "";
          })
          .filter(Boolean);
        if (parts.length) return parts.join("; ");
      }
      if (typeof parsed.message === "string") return parsed.message;
      if (typeof parsed.error === "string") return parsed.error;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
};

const request = async <T>(path: string, init?: RequestOptions): Promise<T> => {
  const url = new URL(path, apiUrl);
  const timeoutMs = init?.timeoutMs ?? defaultTimeoutMs;
  const { controller, timeoutId } = createController(timeoutMs);

  try {
    const headers = new Headers(init?.headers ?? undefined);
    if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    const token = await getSessionToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers,
    });

    if (!response.ok) {
      const raw = await response.text();
      const message = extractErrorMessage(raw);
      throw new Error(message || `Request failed with ${response.status}`);
    }

    const raw = await response.text();
    if (!raw) {
      if (response.status === 204) {
        return undefined as T;
      }
      throw new Error("Expected response body but received empty response");
    }
    return JSON.parse(raw) as T;
  } finally {
    clearTimeout(timeoutId);
  }
};

export type {
  ActivityConversationDetailResponse,
  ActivityConversationsResponse,
  ActivitySummaryResponse,
  AgentResponse,
  AgentWidgetConfigResponse,
  AgentWidgetConfigUpdate,
  AgentWidgetInstallResponse,
  AgentWidgetInstallUpdate,
  BillingCheckoutResponse,
  BillingPortalResponse,
  BillingSummaryResponse,
  ConfigResponse,
  CustomUserSystemPromptResponse,
  CustomUserSystemPromptUpdate,
  ToolPayload,
  ToolResponse,
  FeatureToolsResponse,
  FeaturePayload,
  FeatureTogglePayload,
  FeatureWithTools,
  FrontendCapabilityResponse,
  FrontendCapabilityUpdate,
  KnowledgeBaseStatusResponse,
  KnowledgeBaseToggle,
  KnowledgeDocumentContentResponse,
  KnowledgeDocumentListResponse,
  KnowledgeDocumentResponse,
  KnowledgeWebsiteCreate,
  KnowledgeWebsiteDetailResponse,
  KnowledgeWebsiteListResponse,
  KnowledgeWebsiteResponse,
  OnboardingStateResponse,
  PaginatedTools,
  UserRateLimitsResponse,
  UserRateLimitsUpdate,
  WidgetApiKeyCreateResponse,
  WidgetSecurityDraftUpdate,
  WidgetSecurityResponse,
} from "@/types";

export const apiClient = {
  getConfig: () => request<ConfigResponse>("/config"),
  updateConfig: (payload: ConfigResponse) =>
    request<ConfigResponse>("/config", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listTools: (page: number, pageSize: number, search = "") => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    const term = search.trim();
    if (term) {
      params.set("search", term);
    }
    return request<PaginatedTools>(`/tools?${params.toString()}`);
  },
  createTool: (payload: ToolPayload) =>
    request<ToolResponse>("/tools", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTool: (id: string, payload: ToolPayload) =>
    request<ToolResponse>(`/tools/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteTool: (id: string) =>
    request<void>(`/tools/${id}`, {
      method: "DELETE",
    }),
  listFeatures: (search = "") => {
    const params = new URLSearchParams();
    const term = search.trim();
    if (term) {
      params.set("search", term);
    }
    const query = params.toString();
    const path = query ? `/features?${query}` : "/features";
    return request<FeatureWithTools[]>(path);
  },
  createFeature: (payload: FeaturePayload) =>
    request<FeatureWithTools>("/features", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateFeature: (id: string, payload: FeaturePayload) =>
    request<FeatureWithTools>(`/features/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  toggleFeature: (id: string, payload: FeatureTogglePayload) =>
    request<FeatureWithTools>(`/features/${id}/enabled`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteFeature: (id: string) =>
    request<void>(`/features/${id}`, {
      method: "DELETE",
    }),
  listFeatureTools: (featureId: string, page: number) => {
    const params = new URLSearchParams({ page: String(page) });
    return request<FeatureToolsResponse>(
      `/features/${encodeURIComponent(featureId)}/tools?${params.toString()}`,
    );
  },
  getAgent: () => request<AgentResponse>("/agent"),
  createAgent: () =>
    request<AgentResponse>("/agent", {
      method: "POST",
    }),
  getOnboardingState: () => request<OnboardingStateResponse>("/onboarding/state"),
  startOnboarding: () =>
    request<OnboardingStateResponse>("/onboarding/start", {
      method: "POST",
    }),
  addOnboardingWebsite: (payload: KnowledgeWebsiteCreate) =>
    request<KnowledgeWebsiteResponse>("/onboarding/website", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30000,
    }),
  finalizeOnboarding: () =>
    request<AgentResponse>("/onboarding/finalize", {
      method: "POST",
    }),
  getAgentWidgetSecurity: () => request<WidgetSecurityResponse>("/agent/widget-security"),
  updateAgentWidgetSecurityDraft: (payload: WidgetSecurityDraftUpdate) =>
    request<WidgetSecurityResponse>("/agent/widget-security/draft", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  createAgentWidgetApiKey: () =>
    request<WidgetApiKeyCreateResponse>("/agent/widget-security/api-key", {
      method: "POST",
    }),
  deployAgentWidgetSecurity: () =>
    request<WidgetSecurityResponse>("/agent/widget-security/deploy", {
      method: "POST",
    }),
  discardAgentWidgetSecurityDraft: () =>
    request<WidgetSecurityResponse>("/agent/widget-security/discard", {
      method: "POST",
    }),
  getAgentWidgetConfig: () => request<AgentWidgetConfigResponse>("/agent/widget-config"),
  updateAgentWidgetConfig: (payload: AgentWidgetConfigUpdate) =>
    request<AgentWidgetConfigResponse>("/agent/widget-config", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getAgentWidgetInstall: () => request<AgentWidgetInstallResponse>("/agent/widget-install"),
  updateAgentWidgetInstall: (payload: AgentWidgetInstallUpdate) =>
    request<AgentWidgetInstallResponse>("/agent/widget-install", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getAgentCustomSystemPrompt: () =>
    request<CustomUserSystemPromptResponse>("/agent/custom-system-prompt"),
  updateAgentCustomSystemPrompt: (payload: CustomUserSystemPromptUpdate) =>
    request<CustomUserSystemPromptResponse>("/agent/custom-system-prompt", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getBillingSummary: () => request<BillingSummaryResponse>("/billing"),
  createSubscriptionCheckout: (plan: "basic" | "pro") =>
    request<BillingCheckoutResponse>("/billing/checkout/subscription", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  createTopupCheckout: (pkg: "1000" | "5000" | "10000") =>
    request<BillingCheckoutResponse>("/billing/checkout/topup", {
      method: "POST",
      body: JSON.stringify({ package: pkg }),
    }),
  openBillingPortal: () =>
    request<BillingPortalResponse>("/billing/portal", {
      method: "POST",
    }),
  getActivitySummary: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams()
    if (startDate) params.set("start_date", startDate)
    if (endDate) params.set("end_date", endDate)
    const query = params.toString()
    const path = query ? `/activity/summary?${query}` : "/activity/summary"
    return request<ActivitySummaryResponse>(path)
  },
  listActivityConversations: (options: { startDate?: string; endDate?: string; limit?: number; cursor?: string | null }) => {
    const params = new URLSearchParams()
    if (options.startDate) params.set("start_date", options.startDate)
    if (options.endDate) params.set("end_date", options.endDate)
    if (options.limit) params.set("limit", String(options.limit))
    if (options.cursor) params.set("cursor", options.cursor)
    const query = params.toString()
    const path = query ? `/activity/conversations?${query}` : "/activity/conversations"
    return request<ActivityConversationsResponse>(path)
  },
  getActivityConversationDetail: (
    conversationId: string,
    options: { messageLimit?: number; messageCursor?: string | null; actionLimit?: number; actionCursor?: string | null },
  ) => {
    const params = new URLSearchParams()
    if (options.messageLimit) params.set("message_limit", String(options.messageLimit))
    if (options.messageCursor) params.set("message_cursor", options.messageCursor)
    if (options.actionLimit) params.set("action_limit", String(options.actionLimit))
    if (options.actionCursor) params.set("action_cursor", options.actionCursor)
    const query = params.toString()
    const path = query
      ? `/activity/conversations/${encodeURIComponent(conversationId)}?${query}`
      : `/activity/conversations/${encodeURIComponent(conversationId)}`
    return request<ActivityConversationDetailResponse>(path)
  },
  getAgentFrontendCapability: () => request<FrontendCapabilityResponse>("/agent/frontend-capability"),
  updateAgentFrontendCapability: (payload: FrontendCapabilityUpdate) =>
    request<FrontendCapabilityResponse>("/agent/frontend-capability", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getAgentUserRateLimits: () => request<UserRateLimitsResponse>("/agent/user-rate-limits"),
  updateAgentUserRateLimits: (payload: UserRateLimitsUpdate) =>
    request<UserRateLimitsResponse>("/agent/user-rate-limits", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getKnowledgeBaseStatus: () => request<KnowledgeBaseStatusResponse>("/knowledge-base/status"),
  toggleKnowledgeBase: (payload: KnowledgeBaseToggle) =>
    request<KnowledgeBaseStatusResponse>("/knowledge-base/toggle", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listKnowledgeDocuments: () => request<KnowledgeDocumentListResponse>("/knowledge-base/documents"),
  uploadKnowledgeDocument: (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    return request<KnowledgeDocumentResponse>("/knowledge-base/documents", {
      method: "POST",
      body: formData,
      timeoutMs: 60000,
    })
  },
  deleteKnowledgeDocument: (id: string) =>
    request<void>(`/knowledge-base/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getKnowledgeDocumentContent: (id: string) =>
    request<KnowledgeDocumentContentResponse>(
      `/knowledge-base/documents/${encodeURIComponent(id)}/content`,
    ),
  listKnowledgeWebsites: () =>
    request<KnowledgeWebsiteListResponse>("/knowledge-base/websites"),
  addKnowledgeWebsite: (payload: KnowledgeWebsiteCreate) =>
    request<KnowledgeWebsiteResponse>("/knowledge-base/websites", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30000,
    }),
  getKnowledgeWebsiteDetail: (id: string) =>
    request<KnowledgeWebsiteDetailResponse>(
      `/knowledge-base/websites/${encodeURIComponent(id)}`,
      { timeoutMs: 30000 },
    ),
  refreshKnowledgeWebsite: (id: string) =>
    request<KnowledgeWebsiteResponse>(
      `/knowledge-base/websites/${encodeURIComponent(id)}/refresh`,
      {
        method: "POST",
        timeoutMs: 30000,
      },
    ),
  deleteKnowledgeWebsite: (id: string) =>
    request<void>(`/knowledge-base/websites/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
