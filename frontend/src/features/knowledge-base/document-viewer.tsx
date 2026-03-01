import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useKnowledgeDocumentContentQuery } from "@/queries/use-knowledge-document-content";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
]);

// eslint-disable-next-line react-refresh/only-export-components
export const isViewableDocument = (
  fileType: string,
  status: string,
): boolean => status === "ready" && !IMAGE_EXTENSIONS.has(fileType.toLowerCase());

const countMatches = (text: string, query: string): number => {
  if (!query) return 0;
  const lower = text.toLowerCase();
  const lowerQ = query.toLowerCase();
  let count = 0;
  let pos = lower.indexOf(lowerQ);
  while (pos !== -1) {
    count++;
    pos = lower.indexOf(lowerQ, pos + lowerQ.length);
  }
  return count;
};

const HighlightedText = ({
  text,
  query,
  activeIndex,
  startIndex,
}: {
  text: string;
  query: string;
  activeIndex: number;
  startIndex: number;
}) => {
  if (!query) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let lastEnd = 0;
  let matchIdx = startIndex;

  let pos = lowerText.indexOf(lowerQuery);
  while (pos !== -1) {
    if (pos > lastEnd) parts.push(text.slice(lastEnd, pos));
    const isActive = matchIdx === activeIndex;
    parts.push(
      <mark
        key={matchIdx}
        data-testid={`match-${matchIdx}`}
        data-match-index={matchIdx}
        className={cn(
          "rounded-sm px-0.5",
          isActive
            ? "bg-primary/40 ring-2 ring-primary"
            : "bg-yellow-500/30 text-foreground",
        )}
      >
        {text.slice(pos, pos + query.length)}
      </mark>,
    );
    matchIdx++;
    lastEnd = pos + lowerQuery.length;
    pos = lowerText.indexOf(lowerQuery, lastEnd);
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));
  return <>{parts}</>;
};

export const DocumentViewer = ({
  documentId,
  onOpenChange,
}: {
  documentId: string | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const contentQuery = useKnowledgeDocumentContentQuery(documentId);
  const chunks = useMemo(() => contentQuery.data?.chunks ?? [], [contentQuery.data?.chunks]);
  const fileName = contentQuery.data?.fileName ?? "";

  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const totalMatches = useMemo(() => {
    if (!searchQuery) return 0;
    return chunks.reduce((sum, c) => sum + countMatches(c.content, searchQuery), 0);
  }, [chunks, searchQuery]);

  const chunkStartIndices = useMemo(() => {
    if (!searchQuery) return chunks.map(() => 0);
    const starts: number[] = [];
    let running = 0;
    for (const chunk of chunks) {
      starts.push(running);
      running += countMatches(chunk.content, searchQuery);
    }
    return starts;
  }, [chunks, searchQuery]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!searchQuery || totalMatches === 0) return;
    const el = contentRef.current?.querySelector(
      `[data-match-index="${activeMatchIndex}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeMatchIndex, searchQuery, totalMatches]);

  const goNext = useCallback(() => {
    if (totalMatches === 0) return;
    setActiveMatchIndex((i) => (i + 1) % totalMatches);
  }, [totalMatches]);

  const goPrev = useCallback(() => {
    if (totalMatches === 0) return;
    setActiveMatchIndex((i) => (i - 1 + totalMatches) % totalMatches);
  }, [totalMatches]);

  useEffect(() => {
    if (!documentId) {
      setSearchQuery("");
      setActiveMatchIndex(0);
    }
  }, [documentId]);

  return (
    <Dialog open={Boolean(documentId)} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] w-[96vw] max-w-[960px] flex-col"
        data-testid="document-viewer"
      >
        <DialogHeader>
          <DialogTitle className="truncate">{fileName || "Document"}</DialogTitle>
          <DialogDescription>
            {contentQuery.isPending
              ? "Loading…"
              : `${chunks.length} ${chunks.length === 1 ? "section" : "sections"}`}
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex items-center gap-2"
          data-testid="document-search"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search in document…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="document-search-input"
            />
          </div>
          {searchQuery && (
            <div className="flex items-center gap-1">
              <span
                className="whitespace-nowrap text-xs text-muted-foreground"
                data-testid="match-count"
              >
                {totalMatches === 0
                  ? "No matches"
                  : `${activeMatchIndex + 1} of ${totalMatches}`}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={goPrev}
                disabled={totalMatches === 0}
                data-testid="match-prev"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={goNext}
                disabled={totalMatches === 0}
                data-testid="match-next"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {contentQuery.isPending ? (
          <div className="space-y-4 p-4" data-testid="viewer-loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : contentQuery.isError ? (
          <div
            className="flex flex-1 items-center justify-center"
            data-testid="viewer-error"
          >
            <p className="text-sm text-muted-foreground">
              Failed to load document content.
            </p>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 rounded-xl border border-border/60 bg-muted/10">
            <div
              ref={contentRef}
              className="space-y-4 p-6"
              data-testid="document-content"
            >
              {chunks.map((chunk, i) => (
                <p
                  key={chunk.id}
                  className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90"
                >
                  <HighlightedText
                    text={chunk.content}
                    query={searchQuery}
                    activeIndex={activeMatchIndex}
                    startIndex={chunkStartIndices[i]}
                  />
                </p>
              ))}
              {chunks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  This document has no text content.
                </p>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
