import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { ActionTooltip } from "@/components/action-tooltip"
import { PanelShell } from "@/components/panel-shell"
import { Badge } from "@/components/ui/badge"
import { useConfigQuery } from "@/queries/use-config"
import { useSaveConfig } from "@/queries/use-save-config"
import { configSelectors, useConfigUiStore } from "@/stores/config-ui"
import { toastSelectors, useToastStore } from "@/stores/toast"
import { type AuthorizationType, type HeaderConfig, type StorageSource } from "@/types"
import clsx from "clsx"
import { CornerDownLeft, Trash2, Pencil, Plus } from "lucide-react"

const storageLabels: Record<StorageSource, string> = {
  localStorage: "Local storage",
  sessionStorage: "Session storage",
  cookies: "Cookies"
}

const authLabels: Record<AuthorizationType, string> = {
  bearer: "Bearer",
  basic: "Basic",
  none: "No prefix"
}

export const SessionHeadersPanel = () => {
  const { data, isPending } = useConfigQuery()
  const headerForm = useConfigUiStore(configSelectors.headerForm)
  const setHeaderForm = useConfigUiStore(configSelectors.setHeaderForm)
  const resetHeaderForm = useConfigUiStore(configSelectors.resetHeaderForm)
  const headerDialogOpen = useConfigUiStore(configSelectors.headerDialogOpen)
  const setHeaderDialogOpen = useConfigUiStore(configSelectors.setHeaderDialogOpen)
  const headerSubmitting = useConfigUiStore(configSelectors.headerSubmitting)
  const setHeaderSubmitting = useConfigUiStore(configSelectors.setHeaderSubmitting)
  const { mutateAsync: saveConfig, isPending: isSaving } = useSaveConfig()
  const addToast = useToastStore(toastSelectors.addToast)
  const baseUrl = data?.baseUrl ?? {}
  const headers = data?.headers ?? {}
  const sortedHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
  const trimmedHeaderName = headerForm.name.trim()
  const targetHeaderName = trimmedHeaderName.toLowerCase()
  const isAuthorization = targetHeaderName === "authorization"
  const headerGridCols = "sm:grid-cols-3"
  const editingHeaderName = headerForm.editingKey?.toLowerCase()
  const duplicateHeaderName =
    headerDialogOpen &&
    !headerSubmitting &&
    Boolean(
      trimmedHeaderName &&
        Object.keys(headers).some(
          (key) => key.toLowerCase() === targetHeaderName && key.toLowerCase() !== editingHeaderName
        )
    )
  const canSubmit = Boolean(trimmedHeaderName && headerForm.key.trim() && !duplicateHeaderName)

  const closeHeaderDialog = () => {
    setHeaderDialogOpen(false)
  }

  const openHeaderDialog = () => {
    resetHeaderForm()
    setHeaderDialogOpen(true)
  }

  const startEdit = (name: string, header: HeaderConfig[string]) => {
    const authType = name.toLowerCase() === "authorization" ? header.authType ?? "bearer" : "bearer"
    setHeaderForm({
      name,
      source: header.source as StorageSource,
      key: header.key,
      authType,
      editingKey: name
    })
    setHeaderDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!canSubmit || headerSubmitting) {
      return
    }
    setHeaderSubmitting(true)
    const name = trimmedHeaderName
    const nextHeaders = { ...headers }
    if (headerForm.editingKey && headerForm.editingKey !== name) {
      delete nextHeaders[headerForm.editingKey]
    }
    const headerPayload: HeaderConfig[string] = {
      source: headerForm.source,
      key: headerForm.key.trim()
    }
    if (targetHeaderName === "authorization") {
      headerPayload.authType = headerForm.authType || "bearer"
    }
    nextHeaders[name] = headerPayload
    try {
      await saveConfig({ baseUrl, headers: nextHeaders })
      addToast({ title: "Header saved", description: `${name} updated`, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save header"
      addToast({ title: "Save failed", description: message, variant: "error" })
    } finally {
      setHeaderSubmitting(false)
      closeHeaderDialog()
    }
  }

  const handleDelete = async (name: string) => {
    const nextHeaders = { ...headers }
    delete nextHeaders[name]
    try {
      await saveConfig({ baseUrl, headers: nextHeaders })
      addToast({ title: "Header deleted", description: `${name} removed`, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete header"
      addToast({ title: "Delete failed", description: message, variant: "error" })
    }
  }

  return (
    <Dialog
      open={headerDialogOpen}
      onOpenChange={(open) => {
        setHeaderDialogOpen(open)
      }}
    >
      <PanelShell
        title="Session Headers"
        description="Pass stored browser values with each request."
        action={
          <DialogTrigger asChild>
            <Button
              size="sm"
              onClick={openHeaderDialog}
              disabled={isPending}
              data-testid="open-header-dialog"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add header
            </Button>
          </DialogTrigger>
        }
      >
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-48">Header</TableHead>
                <TableHead className="w-40">Source</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="w-32 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={`header-loading-${index}`}>
                    <TableCell className="w-48">
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell className="w-40">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      <Skeleton className="h-4 w-full max-w-[260px]" />
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="flex justify-end">
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : sortedHeaders.length ? (
                sortedHeaders.map(([name, header]) => (
                  <TableRow key={name}>
                    <TableCell className="w-48">
                      <div className="flex items-center gap-2">
                        <div className="truncate font-medium" title={name}>
                          {name}
                        </div>
                        {name.toLowerCase() === "authorization" ? (
                          <Badge variant="secondary" className="whitespace-nowrap text-[11px]">
                            {authLabels[header.authType ?? "bearer"]}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="w-40">
                      <div className="truncate text-muted-foreground" title={storageLabels[header.source]}>
                        {storageLabels[header.source]}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      <div className="truncate text-muted-foreground" title={header.key}>
                        {header.key}
                      </div>
                    </TableCell>
                    <TableCell className="flex w-32 justify-end gap-2">
                      <ActionTooltip content={`Edit ${name}`}>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => startEdit(name, header)}
                          data-testid={`edit-header-${name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </ActionTooltip>
                      <AlertDialog>
                        <ActionTooltip content={`Delete ${name}`}>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={isSaving}
                              data-testid={`delete-header-${name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                        </ActionTooltip>
                        <AlertDialogContent>
                          <form
                            className="grid gap-4"
                            onSubmit={(event) => {
                              event.preventDefault()
                              if (isSaving) {
                                return
                              }
                              handleDelete(name)
                            }}
                          >
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete header?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Remove the {name} header mapping. Requests will no longer include this value.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                              <AlertDialogAction type="submit" disabled={isSaving}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </form>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Add session headers from the user session for every request, start with Authorization.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </PanelShell>
      <DialogContent className="max-w-3xl">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{headerForm.editingKey ? "Edit header" : "Add header"}</DialogTitle>
            <DialogDescription>Map session values to outgoing request headers.</DialogDescription>
          </DialogHeader>
          <div className={clsx("grid gap-3", headerGridCols, "items-start")}>
            <div className="space-y-2">
              <Label htmlFor="header-name">Header name</Label>
              <Input
                id="header-name"
                placeholder="Authorization"
                value={headerForm.name}
                onChange={(event) => setHeaderForm({ name: event.target.value })}
                data-testid="header-name-input"
              />
              {duplicateHeaderName ? (
                <p className="text-xs text-destructive">Header already exists.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select
                value={headerForm.source}
                onValueChange={(value) => setHeaderForm({ source: value as StorageSource })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="localStorage">Local storage</SelectItem>
                  <SelectItem value="sessionStorage">Session storage</SelectItem>
                  <SelectItem value="cookies">Cookies</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 overflow-visible">
              <Label htmlFor="header-key">Key</Label>
              <Input
                id="header-key"
                placeholder="authorization"
                value={headerForm.key}
                onChange={(event) => setHeaderForm({ key: event.target.value })}
                data-testid="header-key-input"
                className="w-full"
              />
            </div>
            {isAuthorization ? (
              <div className="space-y-2 sm:col-span-1 animate-in fade-in-0">
                <Label>Auth type</Label>
                <Select
                  value={headerForm.authType}
                  onValueChange={(value) => setHeaderForm({ authType: value as AuthorizationType })}
                >
                  <SelectTrigger data-testid="auth-type-trigger" className="w-full">
                    <SelectValue placeholder="Select auth type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearer">Bearer</SelectItem>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="none">No prefix</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={!canSubmit || isSaving || isPending}
              data-testid="save-header"
            >
              {headerForm.editingKey ? "Update header" : "Add header"}
              <CornerDownLeft className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
