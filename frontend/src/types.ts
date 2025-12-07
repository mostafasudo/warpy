export type StorageSource = "localStorage" | "sessionStorage" | "cookies"

export type AuthorizationType = "bearer" | "basic" | "none"

export type ConfigMap = Record<string, string>
export type HeaderConfig = Record<string, { source: StorageSource; key: string; authType?: AuthorizationType }>

export type ConfigResponse = {
  baseUrl: ConfigMap
  headers: HeaderConfig
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type ToolParameters = {
  type: "object"
  properties: Record<string, unknown>
  required?: string[]
}

export type EndpointTool = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: ToolParameters
  }
}

export type FeatureEnabledState = "enabled" | "disabled" | "partial"

export type FeatureSelector = {
  mode: "existing" | "new" | "auto"
  id?: string | null
  name?: string
}

export type FeatureSummary = {
  id: string
  name: string
  enabledState: FeatureEnabledState
  endpointCount: number
}

export type FeatureWithEndpoints = FeatureSummary & {
  endpoints: EndpointResponse[]
}

export type FeaturePayload = {
  name: string
}

export type FeatureTogglePayload = {
  agentEnabled: boolean
}

export type EndpointPayload = {
  path: string
  method: HttpMethod
  tool: EndpointTool
  agentEnabled: boolean
  feature: FeatureSelector
}

export type EndpointResponse = {
  id: string
  path: string
  method: HttpMethod
  tool: EndpointTool
  agentEnabled: boolean
  feature: FeatureSummary
}

export type PaginatedEndpoints = {
  items: EndpointResponse[]
  page: number
  pageSize: number
  total: number
}

export type AgentResponse = {
  id: string
  userId: string
  createdAt: string
  updatedAt: string
}
