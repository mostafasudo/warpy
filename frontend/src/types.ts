export type StorageSource = "localStorage" | "sessionStorage" | "cookies"

export type ConfigMap = Record<string, string>
export type HeaderConfig = Record<string, { source: StorageSource; key: string }>

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

export type EndpointPayload = {
  path: string
  method: HttpMethod
  tool: EndpointTool
}

export type EndpointResponse = EndpointPayload & {
  id: string
}

export type PaginatedEndpoints = {
  items: EndpointResponse[]
  page: number
  pageSize: number
  total: number
}
