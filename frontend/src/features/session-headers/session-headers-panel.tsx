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
import { ActionTooltip } from "@/components/action-tooltip"
import { PanelShell } from "@/components/panel-shell"
import { useConfigQuery } from "@/queries/use-config"
import { useSaveConfig } from "@/queries/use-save-config"
import { configSelectors, useConfigUiStore } from "@/stores/config-ui"
import { type StorageSource } from "@/types"
import { Trash2, Pencil } from "lucide-react"

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
  const { mutateAsync: saveConfig, isPending: isSaving } = useSaveConfig()
  const baseUrl = data?.baseUrl ?? {}
  const headers = data?.headers ?? {}
  const sortedHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
  const canSubmit = Boolean(headerForm.name.trim() && headerForm.key.trim())

  const handleSubmit = async () => {
    if (!canSubmit) {
      return
    }
    const name = headerForm.name.trim()
    const nextHeaders = { ...headers }
    if (headerForm.editingKey && headerForm.editingKey !== name) {
      delete nextHeaders[headerForm.editingKey]
    }
    nextHeaders[name] = { source: headerForm.source, key: headerForm.key.trim() }
    await saveConfig({ baseUrl, headers: nextHeaders })
    resetHeaderForm()
  }

  const handleDelete = async (name: string) => {
    const nextHeaders = { ...headers }
    delete nextHeaders[name]
    await saveConfig({ baseUrl, headers: nextHeaders })
  }

  return (
    <PanelShell
      title="Session Headers"
      description="Pass stored browser values with each request."
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-48">Header</TableHead>
                <TableHead className="w-40">Source</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
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
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-muted-foreground">{storageLabels[header.source]}</TableCell>
                    <TableCell className="text-muted-foreground">{header.key}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <ActionTooltip content={`Edit ${name}`}>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setHeaderForm({
                              name,
                              source: header.source as StorageSource,
                              key: header.key,
                              editingKey: name
                            })
                          }
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
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete header?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove the {name} header mapping. Requests will no longer include this value.
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
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="header-name">Header name</Label>
            <Input
              id="header-name"
              placeholder="Authorization"
              value={headerForm.name}
              disabled={Boolean(headerForm.editingKey)}
              onChange={(event) => setHeaderForm({ name: event.target.value })}
              data-testid="header-name-input"
            />
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
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => resetHeaderForm()}>
            Clear
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSaving || isPending}
            data-testid="save-header"
          >
            {headerForm.editingKey ? "Update header" : "Add header"}
          </Button>
        </div>
      </div>
    </PanelShell>
  )
}
