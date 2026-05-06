import { MarkdownContent } from "@/components/ui/markdown-content"
import { cn } from "@/lib/utils"
import type { WidgetRenderPayload } from "@/types"

type WidgetRenderPayloadViewProps = {
  content: string
  renderPayload?: WidgetRenderPayload | null
  className?: string
}

const toText = (value: unknown) => (typeof value === "string" ? value : "")

const SummaryCard = ({ props }: { props: Record<string, unknown> }) => (
  <div className="rounded-lg border border-border/70 bg-background/70 p-3">
    <p className="text-sm font-semibold">{toText(props.title) || "Summary"}</p>
    {toText(props.body) ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{toText(props.body)}</p> : null}
  </div>
)

const Notice = ({ props }: { props: Record<string, unknown> }) => (
  <div className="rounded-lg border border-border/70 bg-muted/25 p-3 text-sm text-muted-foreground">
    {toText(props.title) ? <p className="font-semibold text-foreground">{toText(props.title)}</p> : null}
    {toText(props.body) ? <p className="mt-1">{toText(props.body)}</p> : null}
  </div>
)

const StatusList = ({ props }: { props: Record<string, unknown> }) => {
  const items = Array.isArray(props.items) ? props.items : []
  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const label = typeof item === "object" && item !== null ? toText((item as { label?: unknown }).label) : ""
        return label ? (
          <div key={`${label}-${index}`} className="flex gap-2 rounded-lg border border-border/60 bg-background/60 p-2 text-sm">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
            <span>{label}</span>
          </div>
        ) : null
      })}
    </div>
  )
}

const CompactTable = ({ props }: { props: Record<string, unknown> }) => {
  const columns = Array.isArray(props.columns) ? props.columns.map(toText).filter(Boolean) : []
  const rows = Array.isArray(props.rows) ? props.rows : []
  if (!columns.length || !rows.length) return null
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-background/70">
      {toText(props.title) ? <p className="border-b border-border/60 px-3 py-2 text-sm font-semibold">{toText(props.title)}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-72 text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 font-medium">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const cells = Array.isArray(row) ? row.map(toText) : []
              return (
                <tr key={rowIndex} className="border-t border-border/50">
                  {columns.map((column, columnIndex) => (
                    <td key={`${column}-${columnIndex}`} className="px-3 py-2 text-foreground/90">
                      {cells[columnIndex] ?? ""}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const WarpyNode = ({ node }: { node: { component: string; props: Record<string, unknown> } }) => {
  if (node.component === "summary_card" || node.component === "record_card") return <SummaryCard props={node.props} />
  if (node.component === "notice") return <Notice props={node.props} />
  if (node.component === "compact_table") return <CompactTable props={node.props} />
  if (node.component === "status_list" || node.component === "timeline" || node.component === "source_list") return <StatusList props={node.props} />
  return null
}

const isRenderableWarpyNode = (node: { component: string }) =>
  ["summary_card", "record_card", "notice", "compact_table", "status_list", "timeline", "source_list"].includes(node.component)

export const WidgetRenderPayloadView = ({ content, renderPayload, className }: WidgetRenderPayloadViewProps) => {
  if (renderPayload?.kind === "warpy_components") {
    const tree = Array.isArray(renderPayload.tree) ? renderPayload.tree : []
    if (!tree.some(isRenderableWarpyNode)) return <MarkdownContent className={cn("mt-2", className)}>{renderPayload.markdownFallback || content}</MarkdownContent>
    return (
      <div className={cn("mt-2 space-y-2", className)}>
        {tree.map((node, index) => (
          <WarpyNode key={`${node.component}-${index}`} node={node} />
        ))}
        {!tree.length ? <MarkdownContent>{content}</MarkdownContent> : null}
      </div>
    )
  }
  if (renderPayload?.kind === "native_components") {
    return (
      <div className={cn("mt-2 space-y-2", className)}>
        <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-3 text-sm text-muted-foreground">
          Rendered with a customer component in the host app.
        </div>
        <MarkdownContent>{renderPayload.markdownFallback || content}</MarkdownContent>
      </div>
    )
  }
  return <MarkdownContent className={cn("mt-2", className)}>{content}</MarkdownContent>
}
