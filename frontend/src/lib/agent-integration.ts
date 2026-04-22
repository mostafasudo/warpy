import { getApiUrl } from "@/api/client"

export const maskApiKey = (last4: string) => `••••••••••••${last4}`

export const getIntegrationDocUrl = () =>
  new URL("/static/integrate-warpy.md", getApiUrl()).toString()

export const buildCodingAgentPrompt = (apiKey: string) =>
  `Fetch ${getIntegrationDocUrl()} and follow the instructions to integrate Warpy into this project. My API key is: ${apiKey}`

export const buildWidgetTokenRefreshPrompt = (agentApiBaseUrl: string, widgetRefreshEndpointPath: string) => `You are implementing a secure widget token refresh endpoint.

Goal
- Create a server-side endpoint at: POST ${widgetRefreshEndpointPath}

Requirements

- Store your Warpy API key in a server-side environment variable (never expose it to the browser).
- call: POST ${agentApiBaseUrl}/widget-token Authorization: Bearer <WARPY_API_KEY>
- Return the upstream JSON exactly as: { token: "<jwt>" }
- The JWT is short-lived (~5 minutes). Do not cache.

Notes

- Keep this endpoint protected by your existing dashboard auth/session.
- The widget will retry token refresh automatically on 401.`.trim()
