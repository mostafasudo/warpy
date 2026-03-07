import { useRef, useState } from "react";
import { BookOpen, Eye, FileText, Loader2, Trash2, Upload } from "lucide-react";

import { PanelShell } from "@/components/panel-shell";
import { ActionTooltip } from "@/components/action-tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBillingSummaryQuery } from "@/queries/use-billing-summary";
import { useKnowledgeBaseStatusQuery } from "@/queries/use-knowledge-base-status";
import { useKnowledgeDocumentsQuery } from "@/queries/use-knowledge-documents";
import { useUploadKnowledgeDocument } from "@/mutations/use-upload-knowledge-document";
import { useDeleteKnowledgeDocument } from "@/mutations/use-delete-knowledge-document";
import { useToggleKnowledgeBase } from "@/mutations/use-toggle-knowledge-base";
import { toastSelectors, useToastStore } from "@/stores/toast";
import type { KnowledgeDocumentResponse } from "@/types";
import { DocumentViewer, isViewableDocument } from "./document-viewer";

const ACCEPTED_EXTENSIONS =
  ".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.xlsx,.xls,.csv,.rtf,.html,.htm,.xml,.json,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.tif,.rst,.tsv,.eml,.msg,.epub";

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "ready")
    return (
      <Badge
        variant="default"
        className="border-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      >
        Ready
      </Badge>
    );
  if (status === "error") return <Badge variant="destructive">Failed</Badge>;
  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      Processing
    </Badge>
  );
};

const DocumentRow = ({
  doc,
  onDelete,
  onView,
  isDeleting,
}: {
  doc: KnowledgeDocumentResponse;
  onDelete: (id: string) => void;
  onView: (id: string) => void;
  isDeleting: boolean;
}) => {
  const actionRef = useRef<HTMLButtonElement>(null);

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
        <StatusBadge status={doc.status} />
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
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              actionRef.current?.focus();
            }}
          >
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                onDelete(doc.id);
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
  );
};

export const KnowledgeBasePanel = () => {
  const addToast = useToastStore(toastSelectors.addToast);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(
    null,
  );

  const billingQuery = useBillingSummaryQuery();
  const statusQuery = useKnowledgeBaseStatusQuery();
  const documentsQuery = useKnowledgeDocumentsQuery();
  const uploadMutation = useUploadKnowledgeDocument();
  const deleteMutation = useDeleteKnowledgeDocument();
  const toggleMutation = useToggleKnowledgeBase();

  const isLoading = statusQuery.isLoading || documentsQuery.isLoading;
  const status = statusQuery.data;
  const documents = documentsQuery.data?.items ?? [];
  const canEnable = documents.some((doc) => doc.status === "ready");
  const isUploadBlocked =
    billingQuery.data?.plan === "free" &&
    (billingQuery.data?.actionsRemaining ?? 0) <= 0;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingCount((c) => c + files.length);
    for (const file of Array.from(files)) {
      try {
        await uploadMutation.mutateAsync(file);
      } catch {
        addToast({
          title: "Upload failed",
          description: `Could not upload ${file.name}.`,
          variant: "error",
        });
      }
    }
    setUploadingCount((c) => c - files.length);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (id: string) => {
    setDeletingIds((prev) => ({ ...prev, [id]: true }));
    try {
      await deleteMutation.mutateAsync(id);
      addToast({
        title: "Document removed",
        description: "The document has been removed.",
        variant: "success",
      });
    } catch {
      addToast({
        title: "Remove failed",
        description: "Could not remove the document.",
        variant: "error",
      });
    } finally {
      setDeletingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleToggle = async (enabled: boolean) => {
    try {
      await toggleMutation.mutateAsync({ enabled });
      addToast({
        title: enabled ? "Knowledge base enabled" : "Knowledge base disabled",
        description: enabled
          ? "Your agent will now use uploaded documents."
          : "Your agent will stop using uploaded documents.",
        variant: "success",
      });
    } catch {
      addToast({
        title: "Update failed",
        description: "Could not update knowledge base.",
        variant: "error",
      });
    }
  };

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
            Upload at least one document to enable
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  return (
    <PanelShell
      title="Knowledge Base"
      description="Upload product documentation so your agent can answer questions using your content."
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
              <p className="text-sm font-semibold">Enable knowledge base</p>
              {toggleSwitch}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            data-testid="file-input"
            onChange={(e) => handleUpload(e.target.files)}
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
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 py-12 text-center"
            data-testid="empty-state"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No documents yet</p>
              <p className="text-xs text-muted-foreground">
                Upload files so your agent can answer product questions.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2" data-testid="document-list">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onDelete={handleDelete}
                onView={setViewingDocumentId}
                isDeleting={!!deletingIds[doc.id]}
              />
            ))}
          </div>
        )}
      </div>

      <DocumentViewer
        documentId={viewingDocumentId}
        onOpenChange={(open) => {
          if (!open) setViewingDocumentId(null);
        }}
      />
    </PanelShell>
  );
};
