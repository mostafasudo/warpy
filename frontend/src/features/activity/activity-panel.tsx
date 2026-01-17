import { useEffect, useMemo, useRef, useState } from "react"
import { Calendar as CalendarIcon, ChevronDown, MessageCircle, Sparkles } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { PanelShell } from "@/components/panel-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { navigationSelectors, useNavigationStore } from "@/stores/navigation"
import { useActivityConversationDetailInfiniteQuery } from "@/queries/use-activity-conversation-detail"
import { useActivityConversationsInfiniteQuery } from "@/queries/use-activity-conversations"
import { useActivitySummaryQuery } from "@/queries/use-activity-summary"
import type { ActivityActionEvent, ActivityConversationRow, ActivityTopAction } from "@/types"

type RangePreset = "7d" | "30d" | "6m" | "12m" | "custom"

const pad2 = (value: number) => String(value).padStart(2, "0")

const formatDateInput = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

const toDisplayTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))

const toDisplayDate = (date: Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)

const useDateRange = () => {
  const today = useMemo(() => new Date(), [])
  const [preset, setPreset] = useState<RangePreset>("30d")
  const defaultCustomStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30), [today])
  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => ({ from: defaultCustomStart, to: today }))
  const [applied, setApplied] = useState<{ startDate?: string; endDate?: string }>(() => ({
    startDate: formatDateInput(defaultCustomStart),
    endDate: formatDateInput(today),
  }))

  const applyPreset = (next: RangePreset) => {
    setPreset(next)
    if (next === "custom") {
      return
    }
    const end = new Date()
    const start = new Date(end)
    if (next === "7d") {
      start.setDate(end.getDate() - 7)
    } else if (next === "30d") {
      start.setDate(end.getDate() - 30)
    } else if (next === "6m") {
      start.setMonth(end.getMonth() - 6)
    } else if (next === "12m") {
      start.setFullYear(end.getFullYear() - 1)
    }
    setApplied({ startDate: formatDateInput(start), endDate: formatDateInput(end) })
  }

  const applyCustomRange = (next: DateRange | undefined) => {
    setCustomRange(next)
    if (!next?.from || !next?.to) return
    setApplied({ startDate: formatDateInput(next.from), endDate: formatDateInput(next.to) })
  }

  return {
    preset,
    applyPreset,
    customRange,
    applyCustomRange,
    applied,
  }
}

const StatCard = ({ label, value, loading }: { label: string; value: number; loading: boolean }) => (
  <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <MessageCircle className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">In this time range.</p>
      </div>
    </div>
    <div className="text-3xl font-semibold tabular-nums">
      {loading ? <Skeleton className="h-8 w-16" /> : value.toLocaleString()}
    </div>
  </div>
)

const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 p-6 text-center">
    <p className="text-sm font-semibold">{title}</p>
    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
  </div>
)

const UserActivityEmptyState = () => {
  const setSection = useNavigationStore(navigationSelectors.setSection)
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>
      <h3 className="mb-2 text-xl font-semibold">No activity yet</h3>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">
        Once your agent starts interacting with users, you’ll see their conversations and actions here.
      </p>
      <Button onClick={() => setSection("agent")}>
        <Sparkles className="mr-2 h-4 w-4" />
        Agent Setup
      </Button>
    </div>
  )
}

const ConversationDetailDialog = ({
  conversationId,
  onOpenChange,
}: {
  conversationId: string | null
  onOpenChange: (open: boolean) => void
}) => {
  const detailQuery = useActivityConversationDetailInfiniteQuery({ conversationId, messageLimit: 200, actionLimit: 200 })
  const pages = detailQuery.data?.pages ?? []
  const detail = pages[0]

  const messages = useMemo(() => pages.slice().reverse().flatMap((page) => page.messages), [pages])
  const actions = useMemo(() => pages.slice().reverse().flatMap((page) => page.actions), [pages])

  const messagesStartRef = useRef<HTMLDivElement | null>(null)
  const actionsStartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof IntersectionObserver !== "function") return
    if (!detailQuery.hasNextPage) return
    if (detailQuery.isFetchingNextPage) return


    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      const isIntersecting = entries.some((entry) => entry.isIntersecting)
      if (isIntersecting && !detailQuery.isFetchingNextPage && detailQuery.hasNextPage) {
        void detailQuery.fetchNextPage()
      }
    }

    const observer = new IntersectionObserver(handleIntersect, { root: null, rootMargin: "100px" })

    if (messagesStartRef.current) observer.observe(messagesStartRef.current)
    if (actionsStartRef.current) observer.observe(actionsStartRef.current)

    return () => observer.disconnect()
  }, [detailQuery.hasNextPage, detailQuery.isFetchingNextPage, detailQuery.fetchNextPage, messages.length, actions.length])

  return (
    <Dialog open={Boolean(conversationId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Conversation</DialogTitle>
          <DialogDescription>
            {detail ? `Last active: ${toDisplayTime(detail.updatedAt)}` : "Loading conversation…"}
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        {detailQuery.isError ? (
          <EmptyState title="Could not load this conversation" description="Try again in a moment." />
        ) : null}

        {detail ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Messages</p>
                {detailQuery.isFetchingNextPage ? (
                  <p className="text-xs text-muted-foreground">Loading older messages…</p>
                ) : null}
              </div>
              <ScrollArea className="h-[520px] rounded-xl border border-border/60 bg-muted/10 p-4">
                <div className="space-y-3">
                  <div ref={messagesStartRef} className="h-px w-full" />
                  {messages.map((message, index) => (
                    <div
                      key={`${message.createdAt}-${index}`}
                      className={cn(
                        "max-w-[92%] rounded-xl border border-border/60 px-4 py-3 text-sm",
                        message.role === "user" ? "ml-auto bg-card" : "bg-muted/20"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-muted-foreground">
                          {message.role === "user" ? "User" : "Assistant"}
                        </p>
                        <p className="text-xs text-muted-foreground">{toDisplayTime(message.createdAt)}</p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  ))}
                  {!messages.length ? (
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  ) : null}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Actions</p>
                {detailQuery.isFetchingNextPage ? (
                  <p className="text-xs text-muted-foreground">Loading older actions…</p>
                ) : null}
              </div>
              <ScrollArea className="h-[520px] rounded-xl border border-border/60 bg-muted/10 p-4">
                <div className="space-y-3">
                  <div ref={actionsStartRef} className="h-px w-full" />
                  {actions.map((action) => (
                    <ActionEventCard key={action.id} action={action} />
                  ))}
                  {!actions.length ? (
                    <p className="text-sm text-muted-foreground">No actions recorded yet.</p>
                  ) : null}
                </div>
              </ScrollArea>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

const JsonBlock = ({ value }: { value: unknown }) => (
  <pre className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-foreground">
    {JSON.stringify(value, null, 2)}
  </pre>
)

const isRecordEmpty = (value: Record<string, unknown> | undefined | null) =>
  !value || Object.keys(value).length === 0

const ActionEventCard = ({ action }: { action: ActivityActionEvent }) => {
  const statusVariant = action.statusCode && action.statusCode >= 400 ? "destructive" : "secondary"
  const hasError = Boolean(action.error) || Boolean(action.statusCode && action.statusCode >= 400)
  const label = action.feature ? `${action.action} · ${action.feature}` : action.action

  const request = action.request ?? { params: {}, query: {}, body: {} }
  const hasRequest =
    !isRecordEmpty(request.params as Record<string, unknown>) ||
    !isRecordEmpty(request.query as Record<string, unknown>) ||
    !isRecordEmpty(request.body as Record<string, unknown>)

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{toDisplayTime(action.createdAt)}</p>
        </div>
        <Badge variant={statusVariant}>
          {action.statusCode ? action.statusCode : hasError ? "Failed" : "Success"}
        </Badge>
      </div>

      {action.error ? (
        <p className="mt-3 text-sm text-muted-foreground">{action.error}</p>
      ) : null}

      {hasRequest ? (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="mt-2 w-full justify-between" data-testid="action-details">
              View request details
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            {!isRecordEmpty(request.params as Record<string, unknown>) ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Path values</p>
                <JsonBlock value={request.params} />
              </div>
            ) : null}
            {!isRecordEmpty(request.query as Record<string, unknown>) ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Search filters</p>
                <JsonBlock value={request.query} />
              </div>
            ) : null}
            {!isRecordEmpty(request.body as Record<string, unknown>) ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Information sent</p>
                <JsonBlock value={request.body} />
              </div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}

const TopActionsTable = ({ items }: { items: ActivityTopAction[] }) => (
  <div className="rounded-xl border border-border/60 bg-muted/10">
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead>Top actions</TableHead>
          <TableHead className="w-[120px] text-right">Uses</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={`${item.feature}-${item.action}`}>
            <TableCell>
              <div className="space-y-1">
                <p className="text-sm font-medium">{item.action}</p>
                {item.feature ? <p className="text-xs text-muted-foreground">{item.feature}</p> : null}
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{item.count.toLocaleString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)

const ConversationsTable = ({
  rows,
  loading,
  fetchingMore,
  onSelect,
}: {
  rows: ActivityConversationRow[]
  loading: boolean
  fetchingMore: boolean
  onSelect: (id: string) => void
}) => (
  <div className="rounded-xl border border-border/60 bg-muted/10">
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[140px]">Conversation</TableHead>
          <TableHead className="w-[200px]">Last active</TableHead>
          <TableHead className="w-[140px] whitespace-nowrap text-right">User messages</TableHead>
          <TableHead className="w-[120px] whitespace-nowrap text-right">Actions</TableHead>
          <TableHead className="w-[96px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton className="h-6 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-40" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-6 w-16" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-6 w-16" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-6 w-16" />
              </TableCell>
            </TableRow>
          ))
        ) : rows.length ? (
          <>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-sm font-medium">{row.id.slice(0, 8)}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{toDisplayTime(row.updatedAt)}</TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{row.userMessageCount.toLocaleString()}</TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{row.actionCount.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onSelect(row.id)} data-testid={`view-${row.id}`}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {fetchingMore ? (
              <TableRow>
                <TableCell>
                  <Skeleton className="h-6 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-40" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-6 w-16" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-6 w-16" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-6 w-16" />
                </TableCell>
              </TableRow>
            ) : null}
          </>
        ) : (
          <TableRow>
            <TableCell colSpan={5}>
              <p className="py-6 text-center text-sm text-muted-foreground">No conversations during this time period.</p>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </div>
)

const DateRangePicker = ({
  value,
  onChange,
  testId,
}: {
  value: DateRange | undefined
  onChange: (value: DateRange | undefined) => void
  testId: string
}) => {
  const [open, setOpen] = useState(false)

  const label = useMemo(() => {
    if (value?.from && value?.to) {
      return `${toDisplayDate(value.from)} – ${toDisplayDate(value.to)}`
    }
    if (value?.from) {
      return toDisplayDate(value.from)
    }
    return "Pick a date range"
  }, [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-[260px] justify-start text-left font-normal", !value?.from && "text-muted-foreground")}
          data-testid={testId}
          aria-label="Date range"
        >
          <CalendarIcon className="h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          defaultMonth={value?.from}
          selected={value}
          onSelect={(next) => {
            onChange(next)
            if (next?.from && next?.to) {
              setOpen(false)
            }
          }}
          numberOfMonths={2}
          className="rounded-lg border shadow-sm"
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export const ActivityPanel = () => {
  const range = useDateRange()
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const summaryQuery = useActivitySummaryQuery(range.applied.startDate, range.applied.endDate)
  const conversationsQuery = useActivityConversationsInfiniteQuery({
    startDate: range.applied.startDate,
    endDate: range.applied.endDate,
    limit: 50,
  })

  const conversations = useMemo(
    () => conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [conversationsQuery.data],
  )

  const topActions = summaryQuery.data?.topActions ?? []

  useEffect(() => {
    if (typeof IntersectionObserver !== "function") return
    if (!conversationsQuery.hasNextPage) return
    if (conversationsQuery.isFetchingNextPage) return
    const node = loadMoreRef.current
    if (!node) return

    let requested = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        if (requested) return
        if (!conversationsQuery.hasNextPage) return
        if (conversationsQuery.isFetchingNextPage) return
        requested = true
        void conversationsQuery.fetchNextPage()
      },
      { root: null, rootMargin: "200px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [
    conversationsQuery.hasNextPage,
    conversationsQuery.isFetchingNextPage,
    conversationsQuery.fetchNextPage,
  ])

  const hasAnyConversation = summaryQuery.data?.hasAnyConversation ?? false
  const isEmpty = !summaryQuery.isPending && !hasAnyConversation

  return (
    <PanelShell
      title="User activity"
      description="Understand how people are using your widget."
      action={
        !isEmpty ? (
          <div className="flex items-center gap-2">
            <Select value={range.preset} onValueChange={(value) => range.applyPreset(value as RangePreset)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last week</SelectItem>
                <SelectItem value="30d">Last month</SelectItem>
                <SelectItem value="6m">Last 6 months</SelectItem>
                <SelectItem value="12m">Last year</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {range.preset === "custom" ? (
              <DateRangePicker
                value={range.customRange}
                onChange={range.applyCustomRange}
                testId="custom-range"
              />
            ) : null}
          </div>
        ) : null
      }
    >
      {isEmpty ? (
        <UserActivityEmptyState />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <StatCard label="Conversations" value={summaryQuery.data?.conversationCount ?? 0} loading={summaryQuery.isPending} />
            <StatCard label="Actions" value={summaryQuery.data?.actionCount ?? 0} loading={summaryQuery.isPending} />
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              Insights
            </div>
            {summaryQuery.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : topActions.length ? (
              <TopActionsTable items={topActions} />
            ) : (
              <EmptyState title="No actions yet" description="No actions during this time period." />
            )}
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Conversations</p>
            </div>
            <ConversationsTable
              rows={conversations}
              loading={conversationsQuery.isPending}
              fetchingMore={conversationsQuery.isFetchingNextPage}
              onSelect={(id) => setSelectedConversationId(id)}
            />
            <div ref={loadMoreRef} className="h-8" />
          </div>
        </>
      )}

      <ConversationDetailDialog
        conversationId={selectedConversationId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedConversationId(null)
          }
        }}
      />
    </PanelShell>
  )
}
