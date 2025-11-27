import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
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
import { Badge } from "@/components/ui/badge"
import { ActionTooltip } from "@/components/action-tooltip"
import { PanelShell } from "@/components/panel-shell"
import { useConfigQuery } from "@/queries/use-config"
import { useSaveConfig } from "@/queries/use-save-config"
import { configSelectors, useConfigUiStore } from "@/stores/config-ui"
import { toastSelectors, useToastStore } from "@/stores/toast"
import { CornerDownLeft, Trash2, Pencil, Plus } from "lucide-react"

const requiredEnvironments = new Set(["local", "production"])

export const BaseUrlsPanel = () => {
  const { data, isPending } = useConfigQuery()
  const baseForm = useConfigUiStore(configSelectors.baseForm)
  const setBaseForm = useConfigUiStore(configSelectors.setBaseForm)
  const resetBaseForm = useConfigUiStore(configSelectors.resetBaseForm)
  const baseDialogOpen = useConfigUiStore(configSelectors.baseDialogOpen)
  const setBaseDialogOpen = useConfigUiStore(configSelectors.setBaseDialogOpen)
  const baseSubmitting = useConfigUiStore(configSelectors.baseSubmitting)
  const setBaseSubmitting = useConfigUiStore(configSelectors.setBaseSubmitting)
  const { mutateAsync: saveConfig, isPending: isSaving } = useSaveConfig()
  const addToast = useToastStore(toastSelectors.addToast)
  const baseUrl = data?.baseUrl ?? {}
  const headers = data?.headers ?? {}

  const sortedBaseUrls = Object.entries(baseUrl).sort(([a], [b]) => a.localeCompare(b))
  const trimmedEnvName = baseForm.envName.trim()
  const effectiveEditingKey = baseForm.editingKey
  const isRequiredEditing = Boolean(effectiveEditingKey && requiredEnvironments.has(effectiveEditingKey))
  const targetName = isRequiredEditing ? effectiveEditingKey : trimmedEnvName
  const duplicateEnvName =
    baseDialogOpen &&
    !baseSubmitting &&
    Boolean(targetName && Object.keys(baseUrl).some((key) => key === targetName && key !== effectiveEditingKey))
  const canSubmit = Boolean(targetName && baseForm.url.trim() && !duplicateEnvName)

  const closeBaseDialog = () => {
    setBaseDialogOpen(false)
  }

  const openBaseDialog = () => {
    resetBaseForm()
    setBaseDialogOpen(true)
  }

  const startEdit = (name: string, url: string) => {
    setBaseForm({
      envName: name,
      url,
      editingKey: name
    })
    setBaseDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!canSubmit || !targetName || baseSubmitting) {
      return
    }
    setBaseSubmitting(true)
    const nextBase = { ...baseUrl }
    if (baseForm.editingKey && baseForm.editingKey !== targetName) {
      delete nextBase[baseForm.editingKey]
    }
    nextBase[targetName] = baseForm.url.trim()
    try {
      await saveConfig({ baseUrl: nextBase, headers })
      addToast({ title: "Environment saved", description: `${targetName} updated`, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save environment"
      addToast({ title: "Save failed", description: message, variant: "error" })
    } finally {
      setBaseSubmitting(false)
      closeBaseDialog()
    }
  }

  const handleDelete = async (name: string) => {
    if (requiredEnvironments.has(name)) {
      return
    }
    const nextBase = { ...baseUrl }
    delete nextBase[name]
    try {
      await saveConfig({ baseUrl: nextBase, headers })
      addToast({ title: "Environment deleted", description: `${name} removed`, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete environment"
      addToast({ title: "Delete failed", description: message, variant: "error" })
    }
  }

  return (
    <Dialog
      open={baseDialogOpen}
      onOpenChange={(open) => {
        setBaseDialogOpen(open)
      }}
    >
      <PanelShell
        title="Base URLs"
        description="Assign base URLs to each environment."
        action={
          <DialogTrigger asChild>
            <Button
              size="sm"
              onClick={openBaseDialog}
              disabled={isPending}
              data-testid="open-base-dialog"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add environment
            </Button>
          </DialogTrigger>
        }
      >
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-32">Environment</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-32 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={`base-loading-${index}`}>
                    <TableCell className="w-32">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full max-w-[360px]" />
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="flex justify-end">
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : sortedBaseUrls.length ? (
                sortedBaseUrls.map(([name, url]) => {
                  const isProtected = requiredEnvironments.has(name)
                  return (
                    <TableRow key={name}>
                      <TableCell className="w-32">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-medium capitalize" title={name}>
                            {name}
                          </div>
                          {isProtected ? (
                            <Badge variant="secondary" className="px-2 py-0 text-[10px]">
                              Default
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[340px]">
                        <div className="truncate text-muted-foreground" title={url}>
                          {url}
                        </div>
                      </TableCell>
                      <TableCell className="flex w-32 justify-end gap-2">
                        <ActionTooltip content={`Edit ${name}`}>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startEdit(name, url)}
                            data-testid={`edit-env-${name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </ActionTooltip>
                        {isProtected ? (
                          <ActionTooltip content="Required environment">
                            <span className="inline-flex">
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled
                                data-testid={`delete-env-${name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </span>
                          </ActionTooltip>
                        ) : (
                          <AlertDialog>
                            <ActionTooltip content={`Delete ${name}`}>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={isSaving}
                                  data-testid={`delete-env-${name}`}
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
                                  <AlertDialogTitle>Delete environment?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Remove the base URL for {name}. This action cannot be undone.
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
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    Add your first environment to route requests to the right base URL.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </PanelShell>
      <DialogContent className="max-w-2xl">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{baseForm.editingKey ? "Edit environment" : "Add environment"}</DialogTitle>
            <DialogDescription>Assign a base URL to an environment.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="env-name">Environment</Label>
              <Input
                id="env-name"
                placeholder="staging"
                value={baseForm.envName}
                onChange={(event) => setBaseForm({ envName: event.target.value })}
                disabled={Boolean(baseForm.editingKey && requiredEnvironments.has(baseForm.editingKey))}
                data-testid="base-env-input"
              />
              {duplicateEnvName ? (
                <p className="text-xs text-destructive">Environment already exists.</p>
              ) : null}
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="env-url">URL</Label>
              <Input
                id="env-url"
                placeholder="https://api.example.com"
                value={baseForm.url}
                onChange={(event) => setBaseForm({ url: event.target.value })}
                data-testid="base-url-input"
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
              data-testid="save-base-env"
            >
              {baseForm.editingKey ? "Update environment" : "Add environment"}
              <CornerDownLeft className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
