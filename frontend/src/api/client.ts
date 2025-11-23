import type { ConfigResponse, EndpointPayload, EndpointResponse, PaginatedEndpoints } from "@/types"

type RequestOptions = Omit<RequestInit, "signal"> & {
  timeoutMs?: number
}

let apiUrl = "http://localhost:8000"
let defaultTimeoutMs = 5000

export const configureApiClient = (config: { apiUrl: string; apiTimeoutMs: number }) => {
  apiUrl = config.apiUrl
  defaultTimeoutMs = config.apiTimeoutMs
}

const getSessionToken = async (): Promise<string | null> => {
  const clerk = (globalThis as typeof globalThis & {
    Clerk?: { session?: { getToken?: () => Promise<string | null> | string | null } }
  }).Clerk
  const session = clerk?.session
  const getter = session?.getToken
  if (!getter || typeof getter !== "function") {
    return null
  }
  const result = await getter()
  return result ?? null
}

const createController = (timeoutMs: number) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(controller.abort.bind(controller), timeoutMs)
  return { controller, timeoutId }
}

const request = async <T>(path: string, init?: RequestOptions): Promise<T> => {
  const url = new URL(path, apiUrl)
  const timeoutMs = init?.timeoutMs ?? defaultTimeoutMs
  const { controller, timeoutId } = createController(timeoutMs)

  try {
    const headers = new Headers(init?.headers ?? undefined)
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    const token = await getSessionToken()
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }

    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || `Request failed with ${response.status}`)
    }

    const raw = await response.text()
    if (!raw) {
      if (response.status === 204) {
        return undefined as T
      }
      throw new Error("Expected response body but received empty response")
    }
    return JSON.parse(raw) as T
  } finally {
    clearTimeout(timeoutId)
  }
}

export type HealthResponse = {
  status: string
}

export type { ConfigResponse, EndpointPayload, EndpointResponse, PaginatedEndpoints } from "@/types"

export const apiClient = {
  health: () => request<HealthResponse>("/health"),
  getConfig: () => request<ConfigResponse>("/config"),
  updateConfig: (payload: ConfigResponse) =>
    request<ConfigResponse>("/config", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  listEndpoints: (page: number, pageSize: number) =>
    request<PaginatedEndpoints>(`/endpoints?page=${page}&page_size=${pageSize}`),
  createEndpoint: (payload: EndpointPayload) =>
    request<EndpointResponse>("/endpoints", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateEndpoint: (id: string, payload: EndpointPayload) =>
    request<EndpointResponse>(`/endpoints/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteEndpoint: (id: string) =>
    request<void>(`/endpoints/${id}`, {
      method: "DELETE"
    })
}
