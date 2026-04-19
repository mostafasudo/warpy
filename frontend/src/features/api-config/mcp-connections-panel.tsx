import { useEffect, useMemo, useState } from "react"
import { Check, Copy, Pencil, Plus, Trash2 } from "lucide-react"

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
import { Badge } from "@/components/ui/badge"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { normalizeCustomerBaseUrl } from "@/lib/widget-install"
import { useCreateMcpConnection } from "@/queries/use-create-mcp-connection"
import { useDeleteMcpConnection } from "@/queries/use-delete-mcp-connection"
import { useMcpConnectionsQuery } from "@/queries/use-mcp-connections"
import { useUpdateMcpConnection } from "@/queries/use-update-mcp-connection"
import { toastSelectors, useToastStore } from "@/stores/toast"
import type { McpAuthMode, McpConnection, McpConnectionPayload } from "@/types"

type HeaderRow = {
  id: string
  name: string
  value: string
}

type FormState = {
  id: string | null
  name: string
  serverUrl: string
  authMode: McpAuthMode
  tokenExchangePath: string
  staticHeaders: HeaderRow[]
}

const authModeLabels: Record<McpAuthMode, string> = {
  none: "No auth",
  static_headers: "Static headers",
  token_exchange: "Token exchange",
}

const emptyForm = (): FormState => ({
  id: null,
  name: "",
  serverUrl: "",
  authMode: "none",
  tokenExchangePath: "",
  staticHeaders: [],
})

const nextHeaderRow = (): HeaderRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  value: "",
})

const toHeaderRows = (headers?: Record<string, string> | null): HeaderRow[] =>
  Object.entries(headers ?? {}).map(([name, value]) => ({
    id: `${name}-${value}`,
    name,
    value,
  }))

const toPayload = (form: FormState): McpConnectionPayload => {
  const staticHeaders = Object.fromEntries(
    form.staticHeaders
      .map((row) => [row.name.trim(), row.value.trim()] as const)
      .filter(([name, value]) => Boolean(name && value))
  )

  return {
    name: form.name.trim(),
    serverUrl: normalizeCustomerBaseUrl(form.serverUrl),
    authMode: form.authMode,
    staticHeaders: form.authMode === "static_headers" ? staticHeaders : null,
    tokenExchangePath: form.authMode === "token_exchange" ? form.tokenExchangePath.trim() : null,
  }
}

const fromConnection = (connection: McpConnection): FormState => ({
  id: connection.id,
  name: connection.name,
  serverUrl: connection.serverUrl,
  authMode: connection.authMode,
  tokenExchangePath: connection.tokenExchangePath ?? "",
  staticHeaders: toHeaderRows(connection.staticHeaders),
})

const buildTokenExchangePrompt = (connection: FormState) =>
  [
    "You are implementing an MCP token exchange endpoint for a signed-in dashboard app.",
    "",
    "Goal",
    `- Create a server-side endpoint at: POST ${connection.tokenExchangePath.trim() || "/mcp/token-exchange"}`,
    "",
    "Context",
    `- This endpoint is for the MCP server: ${connection.serverUrl.trim() || "<MCP_SERVER_URL>"}`,
    "- Warpy calls this path using the current user's normal dashboard session.",
    "- Do not show any new login prompt or OAuth popup to the end user.",
    "",
    "Requirements",
    "- Keep the endpoint behind the app's existing authenticated dashboard session.",
    "- Convert the signed-in user session into short-lived MCP request headers for that same user.",
    '- Return JSON in exactly this shape: { "headers": { "Authorization": "Bearer ..." }, "expiresAt": "<ISO-8601 optional>" }',
    "- The returned headers should be short-lived and safe to refresh frequently.",
    "- Do not persist or cache them long-term.",
    "",
    "Notes",
    "- The endpoint should mint headers for the current signed-in user, not for an app-wide service account unless that is the product's intended user identity model.",
    "- If your MCP provider requires OAuth, finish that server-side using your existing app identity and return only the short-lived MCP headers.",
  ].join("\n")

export const McpConnectionsPanel = () => {
  const { data, isPending } = useMcpConnectionsQuery()
  const createConnection = useCreateMcpConnection()
  const updateConnection = useUpdateMcpConnection()
  const deleteConnection = useDeleteMcpConnection()
  const addToast = useToastStore(toastSelectors.addToast)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [copied, setCopied] = useState(false)

  const connections = data ?? []
  const isSubmitting = createConnection.isPending || updateConnection.isPending
  const isDeleting = deleteConnection.isPending

  useEffect(() => {
    if (!dialogOpen) {
      setCopied(false)
    }
  }, [dialogOpen])

  const staticHeaderCount = useMemo(
    () => form.staticHeaders.filter((row) => row.name.trim() && row.value.trim()).length,
    [form.staticHeaders]
  )

  const canSave = Boolean(
    form.name.trim() &&
      form.serverUrl.trim() &&
      (form.authMode !== "static_headers" || staticHeaderCount > 0) &&
      (form.authMode !== "token_exchange" || form.tokenExchangePath.trim().startsWith("/"))
  )

  const openCreate = () => {
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const openEdit = (connection: McpConnection) => {
    setForm(fromConnection(connection))
    setDialogOpen(true)
  }

  const updateHeaderRow = (id: string, patch: Partial<HeaderRow>) => {
    setForm((current) => ({
      ...current,
      staticHeaders: current.staticHeaders.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }))
  }

  const removeHeaderRow = (id: string) => {
    setForm((current) => ({
      ...current,
      staticHeaders: current.staticHeaders.filter((row) => row.id !== id),
    }))
  }

  const handleSave = async () => {
    if (!canSave || isSubmitting) {
      return
    }
    const payload = toPayload(form)
    try {
      if (form.id) {
        await updateConnection.mutateAsync({ id: form.id, payload })
        addToast({ title: "MCP connection updated", description: `${payload.name} saved`, variant: "success" })
      } else {
        await createConnection.mutateAsync(payload)
        addToast({ title: "MCP connection added", description: `${payload.name} saved`, variant: "success" })
      }
      setDialogOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save MCP connection"
      addToast({ title: "Save failed", description: message, variant: "error" })
    }
  }

  const handleDelete = async (connection: McpConnection) => {
    try {
      await deleteConnection.mutateAsync(connection.id)
      addToast({ title: "MCP connection deleted", description: `${connection.name} removed`, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete MCP connection"
      addToast({ title: "Delete failed", description: message, variant: "error" })
    }
  }

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildTokenExchangePrompt(form))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      addToast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "error" })
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <PanelShell
        title="MCP connections"
        description="Connect live MCP servers."
        action={
          <Button size="sm" onClick={openCreate} disabled={isPending} data-testid="open-mcp-dialog">
            <Plus className="mr-2 h-4 w-4" />
            Add connection
          </Button>
        }
      >
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-48">Connection</TableHead>
                <TableHead>Server URL</TableHead>
                <TableHead className="w-40">Auth</TableHead>
                <TableHead className="w-48">Details</TableHead>
                <TableHead className="w-28 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={`mcp-loading-${index}`}>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full max-w-[320px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="ml-auto h-8 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : connections.length ? (
                connections.map((connection) => (
                  <TableRow key={connection.id}>
                    <TableCell className="font-medium">{connection.name}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-muted-foreground" title={connection.serverUrl}>
                      {connection.serverUrl}
                    </TableCell>
                    <TableCell>
                      <Badge variant={connection.authMode === "none" ? "secondary" : "outline"} className="border">
                        {authModeLabels[connection.authMode]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {connection.authMode === "static_headers"
                        ? `${Object.keys(connection.staticHeaders ?? {}).length} header${Object.keys(connection.staticHeaders ?? {}).length === 1 ? "" : "s"}`
                        : connection.authMode === "token_exchange"
                          ? connection.tokenExchangePath
                          : "No extra setup"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <ActionTooltip content={`Edit ${connection.name}`}>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(connection)} data-testid={`edit-mcp-${connection.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </ActionTooltip>
                        <AlertDialog>
                          <ActionTooltip content={`Delete ${connection.name}`}>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={isDeleting}
                                className="text-muted-foreground hover:text-destructive"
                                data-testid={`delete-mcp-${connection.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                          </ActionTooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this MCP connection?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the saved connection config, but it does not change your Features.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void handleDelete(connection)} disabled={isDeleting}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    Add your first MCP server to let Warpy discover and call live MCP tools directly.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <DialogContent className="max-h-[90vh] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit MCP connection" : "Add MCP connection"}</DialogTitle>
            <DialogDescription>
              Save one MCP server here, then Warpy can discover its tools live during a run.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[68vh] pr-4">
            <div className="space-y-6 py-1">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mcp-name">Connection name</Label>
                  <div className="overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                    <Input
                      id="mcp-name"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
                      data-testid="mcp-name-input"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-auth-mode">Auth mode</Label>
                  <Select
                    value={form.authMode}
                    onValueChange={(value) => setForm((current) => ({ ...current, authMode: value as McpAuthMode }))}
                  >
                    <SelectTrigger id="mcp-auth-mode" data-testid="mcp-auth-mode-trigger">
                      <SelectValue placeholder="Choose auth mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="static_headers">Static headers</SelectItem>
                      <SelectItem value="token_exchange">Token exchange</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-server-url">MCP server URL</Label>
                <div className="overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                  <Input
                    id="mcp-server-url"
                    value={form.serverUrl}
                    onChange={(event) => setForm((current) => ({ ...current, serverUrl: event.target.value }))}
                    placeholder="https://example.com/mcp"
                    className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
                    data-testid="mcp-server-url-input"
                  />
                </div>
              </div>

              {form.authMode === "static_headers" ? (
                <section className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Static headers</h3>
                      <p className="text-sm text-muted-foreground">These headers are sent on every MCP request for this connection.</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setForm((current) => ({ ...current, staticHeaders: [...current.staticHeaders, nextHeaderRow()] }))}
                      data-testid="add-mcp-static-header"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add header
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {form.staticHeaders.length ? (
                      form.staticHeaders.map((row) => (
                        <div key={row.id} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                          <Input
                            value={row.name}
                            onChange={(event) => updateHeaderRow(row.id, { name: event.target.value })}
                            placeholder="Header name"
                            data-testid={`mcp-static-header-name-${row.id}`}
                          />
                          <Input
                            value={row.value}
                            onChange={(event) => updateHeaderRow(row.id, { value: event.target.value })}
                            placeholder="Header value"
                            data-testid={`mcp-static-header-value-${row.id}`}
                          />
                          <Button type="button" size="icon" variant="ghost" onClick={() => removeHeaderRow(row.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Add at least one header for this auth mode.</p>
                    )}
                  </div>
                </section>
              ) : null}

              {form.authMode === "token_exchange" ? (
                <section className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="mcp-token-exchange-path">Token exchange endpoint</Label>
                    <p className="text-sm text-muted-foreground">Warpy sends a <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">POST</code> request to this path on your app.</p>
                    <div className="flex overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                      <span className="flex items-center border-r border-input bg-muted px-3 font-mono text-sm text-muted-foreground">
                        POST
                      </span>
                      <Input
                        id="mcp-token-exchange-path"
                        value={form.tokenExchangePath}
                        onChange={(event) => setForm((current) => ({ ...current, tokenExchangePath: event.target.value }))}
                        placeholder="/api/mcp/token-exchange"
                        className="h-10 min-w-0 flex-1 border-0 bg-transparent font-mono focus-visible:ring-0"
                        data-testid="mcp-token-exchange-path-input"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 rounded-lg border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                    <p>Warpy calls this path on your app using the browser&apos;s stored signed-in session.</p>
                    <p>Your app returns short-lived MCP headers for that user.</p>
                  </div>
                  <Button type="button" variant="outline" className="gap-2" onClick={() => void handleCopyPrompt()} data-testid="copy-mcp-token-exchange-prompt">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy prompt for coding agent"}
                  </Button>
                </section>
              ) : null}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={!canSave || isSubmitting} data-testid="save-mcp-connection">
              Save connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </PanelShell>
    </Dialog>
  )
}
