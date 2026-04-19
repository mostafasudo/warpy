export type StorageSource = "localStorage" | "sessionStorage" | "cookies";
export type AuthStorageSource = StorageSource;

export type AuthorizationType = "bearer" | "basic" | "none";
export type AuthMode = "none" | "header";
export type McpAuthMode = "none" | "static_headers" | "token_exchange";

export type ConfigMap = Record<string, string>;
export type HeaderConfig = Record<string, { source: StorageSource; key: string }>;
export type AuthConfig = {
  mode: AuthMode;
  source?: AuthStorageSource;
  key?: string;
  authType?: AuthorizationType;
};

export type ConfigResponse = {
  baseUrl: ConfigMap;
  auth?: AuthConfig;
  sendCookiesWithRequests?: boolean;
  headers: HeaderConfig;
};

export type McpConnection = {
  id: string;
  name: string;
  serverUrl: string;
  authMode: McpAuthMode;
  staticHeaders?: Record<string, string> | null;
  tokenExchangePath?: string | null;
};

export type McpConnectionPayload = {
  name: string;
  serverUrl: string;
  authMode: McpAuthMode;
  staticHeaders?: Record<string, string> | null;
  tokenExchangePath?: string | null;
};

export type WidgetMcpConnection = {
  id: string;
  name: string;
  authMode: McpAuthMode;
  tokenExchangePath?: string | null;
};

export type OnboardingStatus = "not_started" | "in_progress" | "completed" | "not_applicable";
export type OnboardingStep = "website" | "baseUrl" | "auth" | "agent";

export type OnboardingStateResponse = {
  status: OnboardingStatus;
  shouldShow: boolean;
  nextStep: OnboardingStep;
};

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ToolParameters = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameters;
  };
};

export type ToolType = "backend" | "frontend";

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
  toolCount: number;
  backendToolCount?: number;
};

export type ToolPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type FeatureWithTools = FeatureSummary & {
  tools: ToolResponse[];
  pagination: ToolPagination;
};

export type FeatureToolsResponse = ToolPagination & {
  items: ToolResponse[];
};

export type FeaturePayload = {
  name: string;
};

export type FeatureTogglePayload = {
  agentEnabled: boolean;
};

export type ToolPayload = {
  toolType?: ToolType;
  path?: string;
  method?: HttpMethod;
  tool: ToolDefinition;
  agentEnabled: boolean;
  feature: FeatureSelector;
};

export type ToolResponse = {
  id: string;
  toolType?: ToolType;
  path?: string | null;
  method?: HttpMethod | null;
  tool: ToolDefinition;
  agentEnabled: boolean;
  feature: FeatureSummary;
};

export type PaginatedTools = {
  items: ToolResponse[];
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

export type WidgetBehavior = "overlay" | "push";
export type WidgetAppearanceMode = "infer" | "custom";

export type WidgetThemeColors = {
  text: string;
  mutedText: string;
  background: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentContrast: string;
  accentSoft: string;
  focusRing: string;
  scrim: string;
  launcherBackground: string;
  launcherBorder: string;
  launcherIcon: string;
  headerIcon: string;
  headerIconHover: string;
  assistantBubble: string;
  assistantText: string;
  userBubble: string;
  userText: string;
  userBorder: string;
  inputBackground: string;
  inputText: string;
  inputPlaceholder: string;
  inputBorder: string;
  suggestionBackground: string;
  suggestionText: string;
  suggestionBorder: string;
  suggestionHoverBackground: string;
  activityBackground: string;
  activityText: string;
  activityMuted: string;
  warningBackground: string;
  warningText: string;
  warningBorder: string;
  securityBackground: string;
  securityText: string;
  securityMuted: string;
  codeBackground: string;
};

export type WidgetThemeTypography = {
  fontFamily: string;
  fontSize: number;
  headingSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontWeight: 400 | 500 | 600 | 700;
};

export type WidgetThemeDimensions = {
  panelWidth: number;
  launcherSize: number;
  launcherRadius: number;
  panelRadius: number;
  bubbleRadius: number;
  controlRadius: number;
  inputHeight: number;
  panelPadding: number;
  messagePadding: number;
};

export type WidgetThemeShadows = {
  panelY: number;
  panelBlur: number;
  panelSpread: number;
  panelOpacity: number;
  launcherY: number;
  launcherBlur: number;
  launcherSpread: number;
  launcherOpacity: number;
};

export type WidgetThemeMode = {
  colors: WidgetThemeColors;
  typography: WidgetThemeTypography;
  dimensions: WidgetThemeDimensions;
  shadows: WidgetThemeShadows;
};

export type WidgetTheme = {
  version: 1;
  light: WidgetThemeMode;
  dark: WidgetThemeMode;
};

export type AgentWidgetConfigResponse = {
  widgetTitle: string;
  widgetIconUrl: string | null;
  widgetAppearanceMode: WidgetAppearanceMode;
  widgetTheme: WidgetTheme | null;
  widgetBehavior: WidgetBehavior;
  widgetEmptyTitle: string;
  widgetEmptyDescription: string;
  widgetInputPlaceholder: string;
  widgetSuggestionsEnabled: boolean;
  widgetStarterSuggestions: string[];
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

export type ActivityFrontendAction = {
  action: string;
  selector: string | null;
  status: "ok" | "error";
  error?: string | null;
  durationMs?: number | null;
};

export type ActivityActionEvent = {
  id: string;
  createdAt: string;
  toolType: "backend" | "frontend" | "screen_autopilot";
  feature: string | null;
  action: string | null;
  request: ActivityActionRequest | null;
  frontendGoal: string | null;
  frontendUrl: string | null;
  frontendActions: ActivityFrontendAction[] | null;
  responseBody: unknown | null;
  statusCode: number | null;
  error: string | null;
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

export type FrontendCapabilityResponse = {
  enabled: boolean;
};

export type FrontendCapabilityUpdate = FrontendCapabilityResponse;

export type CustomUserSystemPromptResponse = {
  customUserSystemPrompt: string;
};

export type CustomUserSystemPromptUpdate = CustomUserSystemPromptResponse;

export type UserRateLimitsResponse = {
  enabled: boolean;
  dailyLimit: number | null;
  monthlyLimit: number | null;
};

export type UserRateLimitsUpdate = UserRateLimitsResponse;

export type KnowledgeDocumentStatus = "processing" | "ready" | "error"
export type KnowledgeWebsiteStatus = "processing" | "ready" | "partial" | "error"

export type KnowledgeDocumentResponse = {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  status: KnowledgeDocumentStatus
  chunkCount: number
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export type KnowledgeDocumentListResponse = {
  items: KnowledgeDocumentResponse[]
  total: number
}

export type KnowledgeBaseStatusResponse = {
  enabled: boolean
  documentCount: number
  readyDocumentCount: number
}

export type KnowledgeBaseToggle = {
  enabled: boolean
}

export type KnowledgeChunkResponse = {
  id: string
  content: string
  chunkIndex: number
  chunkMetadata: Record<string, unknown> | null
}

export type KnowledgeDocumentContentResponse = {
  documentId: string
  fileName: string
  chunks: KnowledgeChunkResponse[]
  totalChunks: number
}

export type KnowledgeWebsiteCreate = {
  url: string
}

export type KnowledgeWebsiteResponse = {
  id: string
  inputUrl: string
  scopeUrl: string
  status: KnowledgeWebsiteStatus
  pageCount: number
  readyPageCount: number
  failedPageCount: number
  searchablePageCount: number
  errorMessage: string | null
  lastCrawledAt: string | null
  lastSuccessfulCrawledAt: string | null
  nextRefreshAt: string | null
  createdAt: string
  updatedAt: string
}

export type KnowledgeWebsiteListResponse = {
  items: KnowledgeWebsiteResponse[]
  total: number
}

export type KnowledgeWebsitePageResponse = {
  id: string
  pageName: string
  sourceUrl: string
  status: KnowledgeDocumentStatus
  sectionCount: number
  isSearchable: boolean
  errorMessage: string | null
  updatedAt: string
}

export type KnowledgeWebsiteDetailResponse = {
  website: KnowledgeWebsiteResponse
  pages: KnowledgeWebsitePageResponse[]
}
