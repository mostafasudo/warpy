import type { ComponentType } from "react"
import type { WarpyOutputComponent } from "../core/mountWidget"

export type WarpyReactOutputComponent =
  | WarpyOutputComponent
  | {
      key: string
      version?: string
      component: ComponentType<Record<string, unknown>>
    }

export type WidgetProps = {
  agentId: string
  baseUrl?: string
  scriptSrc: string
  containerId?: string
  components?: WarpyReactOutputComponent[]
}

export declare function Widget(props: WidgetProps): null
