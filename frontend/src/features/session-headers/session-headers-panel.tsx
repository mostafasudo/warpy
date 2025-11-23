import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useConfigQuery } from "@/queries/use-config"
import { useSaveConfig } from "@/queries/use-save-config"
import { configSelectors, useConfigUiStore } from "@/stores/config-ui"
import { toastSelectors, useToastStore } from "@/stores/toast"
import { type StorageSource } from "@/types"
import { Trash2, Pencil, Plus } from "lucide-react"

const storageLabels: Record<StorageSource, string> = {
  localStorage: "Local storage",
  sessionStorage: "Session storage",
  cookies: "Cookies"
}

export const SessionHeadersPanel = () => {
  const { data, isPending } = useConfigQuery()
  const headerForm = useConfigUiStore(configSelectors.headerForm)
  const setHeaderForm = useConfigUiStore(configSelectors.setHeaderForm)
  const resetHeaderForm = useConfigUiStore(configSelectors.resetHeaderForm)
  const headerDialogOpen = useConfigUiStore(configSelectors.headerDialogOpen)
  const setHeaderDialogOpen = useConfigUiStore(configSelectors.setHeaderDialogOpen)
  const { mutateAsync: saveConfig, isPending: isSaving } = useSaveConfig()
  const addToast = useToastStore(toastSelectors.addToast)
  const baseUrl = data?.baseUrl ?? {}
  const headers = data?.headers ?? {}
  const sortedHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
  const trimmedHeaderName = headerForm.name.trim()
  const duplicateHeaderName = Boolean(
    trimmedHeaderName &&
      Object.keys(headers).some((key) => key === trimmedHeaderName && key !== headerForm.editingKey)
  )
  const canSubmit = Boolean(trimmedHeaderName && headerForm.key.trim() && !duplicateHeaderName)

  const closeHeaderDialog = () => {
    setHeaderDialogOpen(false)
  }

  const openHeaderDialog = () => {
    resetHeaderForm()
    setHeaderDialogOpen(true)
  }

  const startEdit = (name: string, header: { source: StorageSource; key: string }) => {
    setHeaderForm({
      name,
      source: header.source as StorageSource,
      key: header.key,
      editingKey: name
    })
    setHeaderDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!canSubmit) {
      return
    }
    const name = trimmedHeaderName
    const nextHeaders = { ...headers }
    if (headerForm.editingKey && headerForm.editingKey !== name) {
      delete nextHeaders[headerForm.editingKey]
    }
    nextHeaders[name] = { source: headerForm.source, key: headerForm.key.trim() }
    try {
      await saveConfig({ baseUrl, headers: nextHeaders })
      addToast({ title: "Header saved", description: `${name} updated`, variant: "success" })
      closeHeaderDialog()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save header"
      addToast({ title: "Save failed", description: message, variant: "error" })
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
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Loading headers...
                  </TableCell>
                </TableRow>
              ) : sortedHeaders.length ? (
                sortedHeaders.map(([name, header]) => (
                  <TableRow key={name}>
                    <TableCell className="w-48">
                      <div className="truncate font-medium" title={name}>
                        {name}
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
                    No headers yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </PanelShell>
      <DialogContent>
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
          <div className="grid gap-3 sm:grid-cols-3">
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
            <div className="space-y-2">
              <Label htmlFor="header-key">Key</Label>
              <Input
                id="header-key"
                placeholder="authorization"
                value={headerForm.key}
                onChange={(event) => setHeaderForm({ key: event.target.value })}
                data-testid="header-key-input"
              />
            </div>
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
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
