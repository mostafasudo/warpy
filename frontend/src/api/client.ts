import type {
  AgentResponse,
  ConfigResponse,
  EndpointPayload,
  EndpointResponse,
  FeatureEndpointsResponse,
  FeaturePayload,
  FeatureTogglePayload,
  FeatureWithEndpoints,
  PaginatedEndpoints,
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

const request = async <T>(path: string, init?: RequestOptions): Promise<T> => {
  const url = new URL(path, apiUrl);
  const timeoutMs = init?.timeoutMs ?? defaultTimeoutMs;
  const { controller, timeoutId } = createController(timeoutMs);

  try {
    const headers = new Headers(init?.headers ?? undefined);
    if (!headers.has("Content-Type")) {
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
      const message = await response.text();
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

export type HealthResponse = {
  status: string;
};

export type {
  AgentResponse,
  ConfigResponse,
  EndpointPayload,
  EndpointResponse,
  FeatureEndpointsResponse,
  FeaturePayload,
  FeatureTogglePayload,
  FeatureWithEndpoints,
  PaginatedEndpoints,
  WidgetApiKeyCreateResponse,
  WidgetSecurityDraftUpdate,
  WidgetSecurityResponse,
} from "@/types";

export const apiClient = {
  health: () => request<HealthResponse>("/health"),
  getConfig: () => request<ConfigResponse>("/config"),
  updateConfig: (payload: ConfigResponse) =>
    request<ConfigResponse>("/config", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listEndpoints: (page: number, pageSize: number, search = "") => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    const term = search.trim();
    if (term) {
      params.set("search", term);
    }
    return request<PaginatedEndpoints>(`/endpoints?${params.toString()}`);
  },
  createEndpoint: (payload: EndpointPayload) =>
    request<EndpointResponse>("/endpoints", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateEndpoint: (id: string, payload: EndpointPayload) =>
    request<EndpointResponse>(`/endpoints/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteEndpoint: (id: string) =>
    request<void>(`/endpoints/${id}`, {
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
    return request<FeatureWithEndpoints[]>(path);
  },
  createFeature: (payload: FeaturePayload) =>
    request<FeatureWithEndpoints>("/features", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateFeature: (id: string, payload: FeaturePayload) =>
    request<FeatureWithEndpoints>(`/features/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  toggleFeature: (id: string, payload: FeatureTogglePayload) =>
    request<FeatureWithEndpoints>(`/features/${id}/enabled`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteFeature: (id: string) =>
    request<void>(`/features/${id}`, {
      method: "DELETE",
    }),
  listFeatureEndpoints: (featureId: string, page: number) => {
    const params = new URLSearchParams({ page: String(page) });
    return request<FeatureEndpointsResponse>(
      `/features/${encodeURIComponent(featureId)}/endpoints?${params.toString()}`,
    );
  },
  getAgent: () => request<AgentResponse>("/agent"),
  createAgent: () =>
    request<AgentResponse>("/agent", {
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
};
