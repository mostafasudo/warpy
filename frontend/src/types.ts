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
  widgetSecurityDisclosureEnabled: boolean;
};

export type AgentWidgetConfigUpdate = AgentWidgetConfigResponse;

export type WidgetInstallFramework = "script" | "react" | "vue" | "angular" | "svelte" | "vanilla";

export type WidgetInstallPackageManager = "npm" | "pnpm" | "yarn";

export type AgentWidgetInstallResponse = {
  framework: WidgetInstallFramework;
  packageManager: WidgetInstallPackageManager;
};

export type AgentWidgetInstallUpdate = AgentWidgetInstallResponse;

export type BillingPlan = "free" | "basic" | "pro" | "enterprise";

export type BillingSummaryResponse = {
  plan: BillingPlan;
  actionsRemaining: number;
  monthlyActionsRemaining: number;
  monthlyActionQuota: number;
  topupActionsRemaining: number;
  lifetimeActionsRemaining: number;
  isWidgetHidden: boolean;
  canManageSubscription: boolean;
  subscriptionStatus: string | null;
  subscriptionRenewsAt: string | null;
};

export type BillingCheckoutResponse = {
  url: string;
};

export type BillingPortalResponse = {
  url: string;
};

export type ActivityTopAction = {
  feature: string;
  action: string;
  count: number;
};

export type ActivitySummaryResponse = {
  conversationCount: number;
  actionCount: number;
  hasAnyConversation: boolean;
  topActions: ActivityTopAction[];
};

export type ActivityConversationRow = {
  id: string;
  participant: string;
  createdAt: string;
  updatedAt: string;
  userMessageCount: number;
  actionCount: number;
};

export type ActivityConversationsResponse = {
  items: ActivityConversationRow[];
  nextCursor: string | null;
};

export type ActivityMessage = {
  role: string;
  content: string;
  createdAt: string;
};

export type ActivityActionRequest = {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
};

export type ActivityActionEvent = {
  id: string;
  createdAt: string;
  feature: string;
  action: string;
  statusCode: number | null;
  error: string | null;
  request: ActivityActionRequest;
};

export type ActivityConversationDetailResponse = {
  id: string;
  participant: string;
  createdAt: string;
  updatedAt: string;
  messages: ActivityMessage[];
  nextMessageCursor: string | null;
  actions: ActivityActionEvent[];
  nextActionCursor: string | null;
};

export type UserRateLimitsResponse = {
  enabled: boolean;
  dailyLimit: number | null;
  monthlyLimit: number | null;
};

export type UserRateLimitsUpdate = UserRateLimitsResponse;
