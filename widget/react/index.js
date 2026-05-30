import { createElement, useEffect, useRef } from "react"
import { createRoot } from "react-dom/client"
import { mountWidget } from "../core/mountWidget.js"

const normalizeComponents = (components) => {
  if (!Array.isArray(components)) return undefined
  return components.map((entry) => {
    if (!entry || !entry.component) return entry
    return {
      key: entry.key,
      version: entry.version,
      render: ({ mount, props }) => {
        const root = createRoot(mount)
        root.render(createElement(entry.component, props))
        return () => root.unmount()
      }
    }
  })
}

export const Widget = ({ agentId, baseUrl, scriptSrc, containerId, components }) => {
  const normalizedComponentsRef = useRef()
  normalizedComponentsRef.current = normalizeComponents(components)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!Array.isArray(normalizedComponentsRef.current)) return
    if (window.warpy && typeof window.warpy.registerComponents === "function") {
      window.warpy.registerComponents(normalizedComponentsRef.current)
      return
    }
    const script = document.querySelector('script[data-warpy-widget-script="true"]')
    if (script) {
      script.__warpyComponents = normalizedComponentsRef.current
    }
  }, [components])

  useEffect(() => {
    const widget = mountWidget({
      agentId,
      baseUrl,
      scriptSrc,
      containerId,
      components: normalizedComponentsRef.current
    })
    return () => widget?.unmount()
  }, [agentId, baseUrl, scriptSrc, containerId])

  return null
}
