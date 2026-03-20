import { FormEvent, useRef, useState } from "react"
import {
  BookOpen,
  Eye,
  FileText,
  Globe,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react"

import { ActionTooltip } from "@/components/action-tooltip"
import { PanelShell } from "@/components/panel-shell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAddKnowledgeWebsite } from "@/mutations/use-add-knowledge-website"
import { useDeleteKnowledgeDocument } from "@/mutations/use-delete-knowledge-document"
import { useDeleteKnowledgeWebsite } from "@/mutations/use-delete-knowledge-website"
import { useRefreshKnowledgeWebsite } from "@/mutations/use-refresh-knowledge-website"
import { useToggleKnowledgeBase } from "@/mutations/use-toggle-knowledge-base"
import { useUploadKnowledgeDocument } from "@/mutations/use-upload-knowledge-document"
import { useBillingSummaryQuery } from "@/queries/use-billing-summary"
import { useKnowledgeBaseStatusQuery } from "@/queries/use-knowledge-base-status"
import { useKnowledgeDocumentsQuery } from "@/queries/use-knowledge-documents"
import { useKnowledgeWebsitesQuery } from "@/queries/use-knowledge-websites"
import { toastSelectors, useToastStore } from "@/stores/toast"
import type {
  KnowledgeDocumentResponse,
  KnowledgeWebsiteResponse,
} from "@/types"

import { DocumentViewer, isViewableDocument } from "./document-viewer"
import { KnowledgeSourceStatusBadge } from "./source-status-badge"
import { WebsiteViewer } from "./website-viewer"

const ACCEPTED_EXTENSIONS =
  ".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.xlsx,.xls,.csv,.rtf,.html,.htm,.xml,.json,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.tif,.rst,.tsv,.eml,.msg,.epub"

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatNextRefresh = (value: string | null): string | null => {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const SourceSection = ({
  title,
  children,
  testId,
}: {
  title: string
  children: React.ReactNode
  testId: string
}) => (
  <div className="space-y-2" data-testid={testId}>
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {title}
    </p>
    <div className="space-y-2">{children}</div>
  </div>
)

const DocumentRow = ({
  doc,
  onDelete,
  onView,
  isDeleting,
}: {
  doc: KnowledgeDocumentResponse
  onDelete: (id: string) => void
  onView: (id: string) => void
  isDeleting: boolean
}) => {
  const actionRef = useRef<HTMLButtonElement>(null)

  return (
    <div
      data-testid={`document-row-${doc.id}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{doc.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(doc.fileSize)}
            {doc.status === "ready" && doc.chunkCount > 0 && (
              <span>
                {" "}
                · {doc.chunkCount}{" "}
                {doc.chunkCount === 1 ? "section" : "sections"}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isViewableDocument(doc.fileType, doc.status) && (
          <ActionTooltip content="View document">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onView(doc.id)}
              data-testid={`view-document-${doc.id}`}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </ActionTooltip>
        )}
        <KnowledgeSourceStatusBadge status={doc.status} />
        <AlertDialog>
          <ActionTooltip content="Remove document">
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                disabled={isDeleting}
                data-testid={`delete-document-${doc.id}`}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
          </ActionTooltip>
          <AlertDialogContent
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              actionRef.current?.focus()
            }}
          >
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                onDelete(doc.id)
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this document?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your agent will stop using this file for answers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                <AlertDialogAction ref={actionRef} type="submit">
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

const WebsiteRow = ({
  website,
  onDelete,
  onRefresh,
  onView,
  isDeleting,
  isRefreshing,
}: {
  website: KnowledgeWebsiteResponse
  onDelete: (id: string) => void
  onRefresh: (id: string) => void
  onView: (id: string) => void
  isDeleting: boolean
  isRefreshing: boolean
}) => {
  const actionRef = useRef<HTMLButtonElement>(null)
  const nextRefresh = formatNextRefresh(website.nextRefreshAt)
  const refreshDisabled = isRefreshing || website.status === "processing"

  return (
    <div
      data-testid={`website-row-${website.id}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <Globe className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{website.inputUrl}</p>
          <p className="text-xs text-muted-foreground">
            {website.pageCount} {website.pageCount === 1 ? "page" : "pages"}
            {nextRefresh ? ` · Next automatic weekly refresh: ${nextRefresh}.` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ActionTooltip content="View website">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onView(website.id)}
            data-testid={`view-website-${website.id}`}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-4 w-4" />
          </Button>
        </ActionTooltip>
        <ActionTooltip content="Refresh website">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onRefresh(website.id)}
            disabled={refreshDisabled}
            data-testid={`refresh-website-${website.id}`}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </ActionTooltip>
        <KnowledgeSourceStatusBadge status={website.status} />
        <AlertDialog>
          <ActionTooltip content="Remove website">
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                disabled={isDeleting}
                data-testid={`delete-website-${website.id}`}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
          </ActionTooltip>
          <AlertDialogContent
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              actionRef.current?.focus()
            }}
          >
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                onDelete(website.id)
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this website?</AlertDialogTitle>
                <AlertDialogDescription>
                  We&apos;ll stop reading this website and remove its pages from
                  your knowledge base.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                <AlertDialogAction ref={actionRef} type="submit">
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

export const KnowledgeBasePanel = () => {
  const addToast = useToastStore(toastSelectors.addToast)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [deletingDocumentIds, setDeletingDocumentIds] = useState<
    Record<string, boolean>
  >({})
  const [deletingWebsiteIds, setDeletingWebsiteIds] = useState<
    Record<string, boolean>
  >({})
  const [refreshingWebsiteIds, setRefreshingWebsiteIds] = useState<
    Record<string, boolean>
  >({})
  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(
    null,
  )
  const [viewingWebsiteId, setViewingWebsiteId] = useState<string | null>(null)
  const [websiteDialogOpen, setWebsiteDialogOpen] = useState(false)
  const [websiteUrl, setWebsiteUrl] = useState("")

  const billingQuery = useBillingSummaryQuery()
  const statusQuery = useKnowledgeBaseStatusQuery()
  const documentsQuery = useKnowledgeDocumentsQuery()
  const websitesQuery = useKnowledgeWebsitesQuery()
  const uploadMutation = useUploadKnowledgeDocument()
  const addWebsiteMutation = useAddKnowledgeWebsite()
  const refreshWebsiteMutation = useRefreshKnowledgeWebsite()
  const deleteWebsiteMutation = useDeleteKnowledgeWebsite()
  const deleteDocumentMutation = useDeleteKnowledgeDocument()
  const toggleMutation = useToggleKnowledgeBase()

  const isLoading =
    statusQuery.isLoading || documentsQuery.isLoading || websitesQuery.isLoading
  const status = statusQuery.data
  const documents = documentsQuery.data?.items ?? []
  const websites = websitesQuery.data?.items ?? []
  const canEnable =
    documents.some((doc) => doc.status === "ready") ||
    websites.some((website) => website.searchablePageCount > 0)
  const isUploadBlocked =
    billingQuery.data?.plan === "free" &&
    (billingQuery.data?.actionsRemaining ?? 0) <= 0

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploadingCount((count) => count + files.length)
    for (const file of Array.from(files)) {
      try {
        await uploadMutation.mutateAsync(file)
      } catch {
        addToast({
          title: "Upload failed",
          description: `Could not upload ${file.name}.`,
          variant: "error",
        })
      }
    }
    setUploadingCount((count) => count - files.length)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDeleteDocument = async (id: string) => {
    setDeletingDocumentIds((current) => ({ ...current, [id]: true }))
    try {
      await deleteDocumentMutation.mutateAsync(id)
      if (viewingDocumentId === id) {
        setViewingDocumentId(null)
      }
      addToast({
        title: "Document removed",
        description: "The document has been removed.",
        variant: "success",
      })
    } catch {
      addToast({
        title: "Remove failed",
        description: "Could not remove the document.",
        variant: "error",
      })
    } finally {
      setDeletingDocumentIds((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
  }

  const handleDeleteWebsite = async (id: string) => {
    setDeletingWebsiteIds((current) => ({ ...current, [id]: true }))
    try {
      await deleteWebsiteMutation.mutateAsync(id)
      if (viewingWebsiteId === id) {
        setViewingWebsiteId(null)
      }
      addToast({
        title: "Website removed",
        description: "The website has been removed from your knowledge base.",
        variant: "success",
      })
    } catch {
      addToast({
        title: "Remove failed",
        description: "Could not remove the website.",
        variant: "error",
      })
    } finally {
      setDeletingWebsiteIds((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
  }

  const handleRefreshWebsite = async (id: string) => {
    setRefreshingWebsiteIds((current) => ({ ...current, [id]: true }))
    try {
      await refreshWebsiteMutation.mutateAsync(id)
      addToast({
        title: "Website refresh started",
        description: "We’re reading this website again now.",
        variant: "success",
      })
    } catch {
      addToast({
        title: "Refresh failed",
        description: "Could not refresh the website.",
        variant: "error",
      })
    } finally {
      setRefreshingWebsiteIds((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
  }

  const handleAddWebsite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      const website = await addWebsiteMutation.mutateAsync({
        url: websiteUrl.trim(),
      })
      setWebsiteDialogOpen(false)
      setWebsiteUrl("")
      setViewingWebsiteId(website.id)
      addToast({
        title: "Website added",
        description: "We’ve started reading this website.",
        variant: "success",
      })
    } catch (error) {
      addToast({
        title: "Add website failed",
        description:
          error instanceof Error ? error.message : "Could not add the website.",
        variant: "error",
      })
    }
  }

  const handleToggle = async (enabled: boolean) => {
    try {
      await toggleMutation.mutateAsync({ enabled })
      addToast({
        title: enabled ? "Knowledge base enabled" : "Knowledge base disabled",
        description: enabled
          ? "Your agent will now use your knowledge sources."
          : "Your agent will stop using your knowledge sources.",
        variant: "success",
      })
    } catch {
      addToast({
        title: "Update failed",
        description: "Could not update knowledge base.",
        variant: "error",
      })
    }
  }

  const toggleSwitch = (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2">
      {canEnable ? (
        <>
          <Switch
            checked={status?.enabled ?? false}
            onCheckedChange={handleToggle}
            disabled={toggleMutation.isPending}
            data-testid="kb-toggle"
          />
          <span className="text-sm font-medium">
            {status?.enabled ? "Enabled" : "Disabled"}
          </span>
        </>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-3">
              <Switch checked={false} disabled data-testid="kb-toggle" />
              <span className="text-sm font-medium text-muted-foreground">
                Disabled
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Add at least one ready source to enable
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )

  const hasSources = documents.length > 0 || websites.length > 0

  return (
    <PanelShell
      title="Knowledge Base"
      description="Add product docs or a public website so your agent can answer questions using your content."
    >
      <div className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : (
          <div
            className="rounded-xl border border-border/70 bg-muted/20 p-4"
            data-testid="kb-toggle-card"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Enable knowledge base</p>
                <p className="text-xs text-muted-foreground">
                  Your agent will use any ready documents and websites you add
                  here.
                </p>
              </div>
              {toggleSwitch}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            data-testid="file-input"
            onChange={(event) => handleUpload(event.target.files)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingCount > 0 || isUploadBlocked}
                  data-testid="upload-button"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadingCount > 0 ? "Uploading…" : "Upload documents"}
                </Button>
              </span>
            </TooltipTrigger>
            {isUploadBlocked && (
              <TooltipContent>
                Upgrade your plan to upload documents
              </TooltipContent>
            )}
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  onClick={() => setWebsiteDialogOpen(true)}
                  disabled={addWebsiteMutation.isPending || isUploadBlocked}
                  data-testid="add-website-button"
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Add website
                </Button>
              </span>
            </TooltipTrigger>
            {isUploadBlocked && (
              <TooltipContent>
                Upgrade your plan to add knowledge sources
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : hasSources ? (
          <div className="space-y-4">
            {websites.length > 0 && (
              <SourceSection title="Websites" testId="website-list">
                {websites.map((website) => (
                  <WebsiteRow
                    key={website.id}
                    website={website}
                    onDelete={handleDeleteWebsite}
                    onRefresh={handleRefreshWebsite}
                    onView={setViewingWebsiteId}
                    isDeleting={Boolean(deletingWebsiteIds[website.id])}
                    isRefreshing={Boolean(refreshingWebsiteIds[website.id])}
                  />
                ))}
              </SourceSection>
            )}
            {documents.length > 0 && (
              <SourceSection title="Documents" testId="document-list">
                {documents.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    onDelete={handleDeleteDocument}
                    onView={setViewingDocumentId}
                    isDeleting={Boolean(deletingDocumentIds[doc.id])}
                  />
                ))}
              </SourceSection>
            )}
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 py-12 text-center"
            data-testid="empty-state"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No sources yet</p>
              <p className="text-xs text-muted-foreground">
                Upload files or add a public website so your agent can answer
                product questions.
              </p>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={websiteDialogOpen}
        onOpenChange={(open) => {
          setWebsiteDialogOpen(open)
          if (!open) {
            setWebsiteUrl("")
          }
        }}
      >
        <DialogContent className="max-w-lg" data-testid="add-website-dialog">
          <form className="space-y-4" onSubmit={handleAddWebsite}>
            <DialogHeader className="space-y-1">
              <DialogTitle>Add website</DialogTitle>
              <DialogDescription className="space-y-1">
                <span className="block">
                  The website must be publicly accessible.
                </span>
                <span className="block">
                  We&apos;ll read every page under the website or path you
                  provide.
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="knowledge-website-url">Website</Label>
              <Input
                id="knowledge-website-url"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                placeholder="knowledge.your-product.com"
                autoFocus
                data-testid="website-url-input"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setWebsiteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!websiteUrl.trim() || addWebsiteMutation.isPending}
                data-testid="submit-website-button"
              >
                {addWebsiteMutation.isPending ? "Adding…" : "Add website"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DocumentViewer
        documentId={viewingDocumentId}
        onOpenChange={(open) => {
          if (!open) setViewingDocumentId(null)
        }}
      />

      <WebsiteViewer
        websiteId={viewingWebsiteId}
        onOpenChange={(open) => {
          if (!open) setViewingWebsiteId(null)
        }}
      />
    </PanelShell>
  )
}
