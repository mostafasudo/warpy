export type StorageSource = "localStorage" | "sessionStorage" | "cookies";

export type AuthorizationType = "bearer" | "basic" | "none";

export type ConfigMap = Record<string, string>;
export type HeaderConfig = Record<
  string,
  { source: StorageSource; key: string; authType?: AuthorizationType }
>;

export type ConfigResponse = {
  baseUrl: ConfigMap;
  headers: HeaderConfig;
};

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ToolParameters = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type EndpointTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameters;
  };
};

export type FeatureEnabledState = "enabled" | "disabled" | "partial";

export type FeatureSelector = {
  mode: "existing" | "new" | "auto";
  id?: string | null;
  name?: string;
};

export type FeatureSummary = {
  id: string;
  name: string;
  enabledState: FeatureEnabledState;
  endpointCount: number;
};

export type EndpointPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type FeatureWithEndpoints = FeatureSummary & {
  endpoints: EndpointResponse[];
  pagination: EndpointPagination;
};

export type FeatureEndpointsResponse = EndpointPagination & {
  items: EndpointResponse[];
};

export type FeaturePayload = {
  name: string;
};

export type FeatureTogglePayload = {
  agentEnabled: boolean;
};

export type EndpointPayload = {
  path: string;
  method: HttpMethod;
  tool: EndpointTool;
  agentEnabled: boolean;
  feature: FeatureSelector;
};

export type EndpointResponse = {
  id: string;
  path: string;
  method: HttpMethod;
  tool: EndpointTool;
  agentEnabled: boolean;
  feature: FeatureSummary;
};

export type PaginatedEndpoints = {
  items: EndpointResponse[];
  page: number;
  pageSize: number;
  total: number;
};

export type AgentResponse = {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type WidgetSecurityActive = {
  requireSignedWidgetToken: boolean;
  widgetRefreshEndpointPath: string;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
};

export type WidgetSecurityDraft = {
  requireSignedWidgetToken: boolean | null;
  widgetRefreshEndpointPath: string | null;
  apiKeyLast4: string | null;
};

export type WidgetSecurityResponse = {
  active: WidgetSecurityActive;
  draft: WidgetSecurityDraft | null;
  hasStagedChanges: boolean;
};

export type WidgetSecurityDraftUpdate = {
  requireSignedWidgetToken?: boolean | null;
  widgetRefreshEndpointPath?: string | null;
};

export type WidgetApiKeyCreateResponse = {
  apiKey: string;
  apiKeyLast4: string;
};

export type AgentWidgetConfigResponse = {
  widgetTitle: string;
  widgetSubtitle: string;
  widgetIconUrl: string | null;
  widgetEmptyTitle: string;
  widgetEmptyDescription: string;
  widgetInputPlaceholder: string;
};

export type AgentWidgetConfigUpdate = AgentWidgetConfigResponse;

export type WidgetInstallFramework = "script" | "react" | "vue" | "angular" | "svelte" | "vanilla";

export type WidgetInstallPackageManager = "npm" | "pnpm" | "yarn";

export type AgentWidgetInstallResponse = {
  framework: WidgetInstallFramework;
  packageManager: WidgetInstallPackageManager;
};

export type AgentWidgetInstallUpdate = AgentWidgetInstallResponse;
