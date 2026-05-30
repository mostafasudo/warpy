export const mountWidget = ({ agentId, baseUrl, scriptSrc, containerId, components } = {}) => {
  if (typeof document === "undefined") {
    return { unmount: () => {} }
  }
  if (!agentId || !scriptSrc) {
    return { unmount: () => {} }
  }

  const existing = containerId
    ? document.getElementById(containerId)
    : document.querySelector('[data-warpy-widget-root="true"]')
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing)
  }

  const container = document.createElement("div")
  container.setAttribute("data-warpy-widget-root", "true")
  if (containerId) {
    container.id = containerId
  }
  document.body.appendChild(container)

  const script = document.createElement("script")
  script.setAttribute("data-warpy-widget-script", "true")
  script.async = true
  script.src = scriptSrc
  script.dataset.agentId = agentId
  if (Array.isArray(components)) {
    script.__warpyComponents = components
    script.addEventListener("load", () => {
      if (typeof window !== "undefined" && typeof window.warpy?.registerComponents === "function") {
        window.warpy.registerComponents(script.__warpyComponents)
      }
    }, { once: true })
  }
  if (typeof baseUrl === "string" && baseUrl.trim()) {
    script.dataset.baseUrl = baseUrl.trim()
  }
  container.appendChild(script)

  return {
    unmount: () => {
      container.remove()
    }
  }
}
