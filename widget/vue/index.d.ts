import type { DefineComponent } from "vue"

declare const Widget: DefineComponent<{
  agentId: string
  baseUrl?: string
  scriptSrc: string
  containerId?: string
  components?: unknown[]
}>

export { Widget }
export default Widget
