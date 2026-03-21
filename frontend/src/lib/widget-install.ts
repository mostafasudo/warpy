declare const __VITE_WIDGET_CDN_URL__: string | undefined

export const getWidgetCdnUrl = (): string => {
  if (typeof __VITE_WIDGET_CDN_URL__ !== "undefined") return __VITE_WIDGET_CDN_URL__
  if (typeof process !== "undefined" && process.env?.VITE_WIDGET_CDN_URL) {
    return process.env.VITE_WIDGET_CDN_URL
  }
  return ""
}

export const normalizeCustomerBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export const buildScriptSnippet = (agentId: string, baseUrl: string, scriptSrc: string) => {
  const normalizedBaseUrl = normalizeCustomerBaseUrl(baseUrl)
  const baseUrlAttribute = normalizedBaseUrl ? `\n  data-base-url="${normalizedBaseUrl}"` : ""
  return `<script src="${scriptSrc}"
  data-agent-id="${agentId}"${baseUrlAttribute}
></script>`
}

