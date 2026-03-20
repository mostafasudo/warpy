import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"

export const KnowledgeSourceStatusBadge = ({
  status,
}: {
  status: string
}) => {
  if (status === "ready") {
    return (
      <Badge
        variant="default"
        className="border-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      >
        Ready
      </Badge>
    )
  }

  if (status === "partial") {
    return (
      <Badge
        variant="secondary"
        className="border-0 bg-amber-500/15 text-amber-700 dark:text-amber-300"
      >
        Partial
      </Badge>
    )
  }

  if (status === "error") {
    return <Badge variant="destructive">Failed</Badge>
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      Processing
    </Badge>
  )
}
