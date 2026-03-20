import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useKnowledgeWebsiteDetailQuery } from "@/queries/use-knowledge-website-detail"

import { KnowledgeSourceStatusBadge } from "./source-status-badge"

const formatDateTime = (value: string | null): string | null => {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export const WebsiteViewer = ({
  websiteId,
  onOpenChange,
}: {
  websiteId: string | null
  onOpenChange: (open: boolean) => void
}) => {
  const detailQuery = useKnowledgeWebsiteDetailQuery(websiteId)
  const website = detailQuery.data?.website
  const pages = detailQuery.data?.pages ?? []
  const nextRefreshAt = formatDateTime(website?.nextRefreshAt ?? null)
  const showErrorState = detailQuery.isError && !detailQuery.data

  return (
    <Dialog open={Boolean(websiteId)} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] w-[96vw] max-w-[1100px] flex-col overflow-hidden"
        data-testid="website-viewer"
      >
        <DialogHeader className="space-y-3 pr-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <DialogTitle className="break-all">
                {website?.inputUrl ?? "Website"}
              </DialogTitle>
              <DialogDescription className="space-y-1">
                <span className="block">
                  The website must be publicly accessible. We read everything
                  under this website or path.
                </span>
              </DialogDescription>
            </div>
            <div className="flex shrink-0 justify-start sm:justify-end">
              <KnowledgeSourceStatusBadge status={website?.status ?? "processing"} />
            </div>
          </div>
          {website && (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <p>
                {website.pageCount} {website.pageCount === 1 ? "page" : "pages"}
                {" · "}
                {website.readyPageCount} ready
                {" · "}
                {website.failedPageCount} failed
              </p>
              {website.errorMessage && (
                <p className="mt-1 text-foreground/80">{website.errorMessage}</p>
              )}
              {nextRefreshAt && (
                <p className="mt-1">Next weekly refresh: {nextRefreshAt}</p>
              )}
            </div>
          )}
        </DialogHeader>

        {detailQuery.isPending ? (
          <div className="space-y-3 p-1" data-testid="website-viewer-loading">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : showErrorState ? (
          <div
            className="flex flex-1 items-center justify-center"
            data-testid="website-viewer-error"
          >
            <p className="text-sm text-muted-foreground">
              Failed to load website details.
            </p>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-muted/10">
            <div className="space-y-3 p-4" data-testid="website-page-list">
              {pages.map((page) => {
                const displayStatus =
                  page.status === "processing"
                    ? "processing"
                    : page.isSearchable
                      ? "ready"
                      : page.status

                return (
                <div
                  key={page.id}
                  className="rounded-xl border border-border/60 bg-background/90 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="break-words text-sm font-medium">
                        {page.pageName}
                      </p>
                      <p className="break-all text-xs text-muted-foreground">
                        {page.sourceUrl}
                      </p>
                    </div>
                    <div className="flex shrink-0 justify-start sm:justify-end">
                      <KnowledgeSourceStatusBadge status={displayStatus} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
                    <p>
                      {page.sectionCount}{" "}
                      {page.sectionCount === 1 ? "section" : "sections"}
                    </p>
                    {page.errorMessage && (
                      <p className="text-foreground/80">{page.errorMessage}</p>
                    )}
                  </div>
                </div>
                )
              })}
              {pages.length === 0 && (
                <div
                  className="rounded-xl border border-dashed border-border/60 bg-background/70 px-4 py-10 text-center text-sm text-muted-foreground"
                  data-testid="website-viewer-empty"
                >
                  We&apos;re starting to read this website. Page updates will
                  appear here as they finish.
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
