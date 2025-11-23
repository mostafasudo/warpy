import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { ActionTooltip } from "@/components/action-tooltip"
import { PanelShell } from "@/components/panel-shell"
import { useConfigQuery } from "@/queries/use-config"
import { useSaveConfig } from "@/queries/use-save-config"
import { configSelectors, useConfigUiStore } from "@/stores/config-ui"
import { Trash2, Pencil } from "lucide-react"

const requiredEnvironments = new Set(["local", "production"])

export const BaseUrlsPanel = () => {
  const { data, isPending } = useConfigQuery()
  const baseForm = useConfigUiStore(configSelectors.baseForm)
  const setBaseForm = useConfigUiStore(configSelectors.setBaseForm)
  const resetBaseForm = useConfigUiStore(configSelectors.resetBaseForm)
  const { mutateAsync: saveConfig, isPending: isSaving } = useSaveConfig()
  const baseUrl = data?.baseUrl ?? {}
  const headers = data?.headers ?? {}

  const sortedBaseUrls = Object.entries(baseUrl).sort(([a], [b]) => a.localeCompare(b))
  const canSubmit = Boolean(baseForm.envName.trim() && baseForm.url.trim())

  const handleSubmit = async () => {
    if (!canSubmit) {
      return
    }
    const nextBase = { ...baseUrl, [baseForm.envName.trim()]: baseForm.url.trim() }
    await saveConfig({ baseUrl: nextBase, headers })
    resetBaseForm()
  }

  const handleDelete = async (name: string) => {
    if (requiredEnvironments.has(name)) {
      return
    }
    const nextBase = { ...baseUrl }
    delete nextBase[name]
    await saveConfig({ baseUrl: nextBase, headers })
  }

  return (
    <PanelShell
      title="Base URLs"
      description="Assign base URLs to each environment."
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-32">Environment</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    Loading base URLs...
                  </TableCell>
                </TableRow>
              ) : sortedBaseUrls.length ? (
                sortedBaseUrls.map(([name, url]) => {
                  const isProtected = requiredEnvironments.has(name)
                  return (
                    <TableRow key={name}>
                      <TableCell className="font-medium capitalize">{name}</TableCell>
                      <TableCell className="text-muted-foreground">{url}</TableCell>
                      <TableCell className="flex justify-end gap-2">
                        <ActionTooltip content={`Edit ${name}`}>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              setBaseForm({
                                envName: name,
                                url,
                                editingKey: name
                              })
                            }
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
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete environment?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Remove the base URL for {name}. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(name)} disabled={isSaving}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
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
                    No environments yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="env-name">Environment</Label>
            <Input
              id="env-name"
              placeholder="staging"
              value={baseForm.envName}
              disabled={Boolean(baseForm.editingKey)}
              onChange={(event) => setBaseForm({ envName: event.target.value })}
              data-testid="base-env-input"
            />
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
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => resetBaseForm()}>
            Clear
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSaving || isPending}
            data-testid="save-base-env"
          >
            {baseForm.editingKey ? "Update environment" : "Add environment"}
          </Button>
        </div>
      </div>
    </PanelShell>
  )
}
