import { BaseUrlsPanel } from "@/features/base-urls/base-urls-panel"
import { McpConnectionsPanel } from "@/features/api-config/mcp-connections-panel"
import { SessionHeadersPanel } from "@/features/session-headers/session-headers-panel"

export const ApiConfigPanel = () => (
  <div className="space-y-6">
    <BaseUrlsPanel />
    <SessionHeadersPanel />
    <McpConnectionsPanel />
  </div>
)
