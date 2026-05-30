export type WarpyRenderCleanup = () => void
export type WarpyRenderResult = Node | string | void | WarpyRenderCleanup

export type WarpyOutputComponent = {
  key: string
  version?: string
  render: (context: {
    mount: HTMLElement
    props: Record<string, unknown>
    markdownFallback: string
  }) => WarpyRenderResult | Promise<WarpyRenderResult>
}

export type MountWidgetOptions = {
  agentId: string
  baseUrl?: string
  scriptSrc: string
  containerId?: string
  components?: WarpyOutputComponent[]
}

export type MountedWidget = {
  unmount: () => void
}

export declare const mountWidget: (options: MountWidgetOptions) => MountedWidget
