import { useEffect, useState } from "react"

import { ActionTooltip } from "@/components/action-tooltip"
import { DirtyActions, UnsavedBadge } from "@/components/dirty-state"
import { PanelShell } from "@/components/panel-shell"
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
import { Switch } from "@/components/ui/switch"
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
import { useConfigQuery } from "@/queries/use-config"
import { useSaveConfig } from "@/queries/use-save-config"
import { configSelectors, useConfigUiStore } from "@/stores/config-ui"
import { toastSelectors, useToastStore } from "@/stores/toast"
import type { AuthConfig, AuthorizationType, HeaderConfig, StorageSource } from "@/types"
import { CornerDownLeft, Pencil, Plus, Trash2 } from "lucide-react"

type AuthFormState = {
  mode: "none" | "header"
  source: StorageSource
  key: string
  authType: AuthorizationType
}

const storageLabels: Record<StorageSource, string> = {
  localStorage: "Local storage",
  sessionStorage: "Session storage",
  cookies: "Cookies"
}

const defaultAuthForm: AuthFormState = {
  mode: "none",
  source: "localStorage",
  key: "",
  authType: "bearer"
}

const normalizeAuthForm = (auth?: AuthConfig): AuthFormState => {
  if (auth?.mode !== "header") {
    return defaultAuthForm
  }
  return {
    mode: "header",
    source: auth.source ?? "localStorage",
    key: auth.key ?? "",
    authType: auth.authType ?? "bearer"
  }
}

const shouldSendCookies = (auth?: AuthConfig, sendCookiesWithRequests?: boolean) =>
  Boolean(sendCookiesWithRequests || (auth as { mode?: string } | undefined)?.mode === "browserCookies")

const buildAuthPayload = (authForm: AuthFormState): AuthConfig =>
  authForm.mode === "header"
    ? {
        mode: "header",
        source: authForm.source,
        key: authForm.key.trim(),
        authType: authForm.authType
      }
    : { mode: "none" }

const areAuthConfigsEqual = (left: AuthConfig, right: AuthConfig) => {
  if (left.mode !== right.mode) {
    return false
  }
  if (left.mode !== "header" || right.mode !== "header") {
    return true
  }
  return (
    left.source === right.source &&
    (left.key ?? "").trim() === (right.key ?? "").trim() &&
    (left.authType ?? "bearer") === (right.authType ?? "bearer")
  )
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
  const [authForm, setAuthForm] = useState<AuthFormState>(defaultAuthForm)
  const [sendCookiesWithRequests, setSendCookiesWithRequests] = useState(false)

  const baseUrl = data?.baseUrl ?? {}
  const headers = data?.headers ?? {}
  const savedAuthPayload = buildAuthPayload(normalizeAuthForm(data?.auth))
  const authPayload = buildAuthPayload(authForm)
  const savedSendCookiesWithRequests = shouldSendCookies(data?.auth, data?.sendCookiesWithRequests)
  const sortedHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
  const trimmedHeaderName = headerForm.name.trim()
  const targetHeaderName = trimmedHeaderName.toLowerCase()
  const editingHeaderName = headerForm.editingKey?.toLowerCase()
  const reservedAuthorizationHeader = targetHeaderName === "authorization"
  const duplicateHeaderName =
    headerDialogOpen &&
    !headerSubmitting &&
    Boolean(
      trimmedHeaderName &&
        Object.keys(headers).some(
          (key) => key.toLowerCase() === targetHeaderName && key.toLowerCase() !== editingHeaderName
        )
    )
  const canSubmit = Boolean(trimmedHeaderName && headerForm.key.trim() && !duplicateHeaderName && !reservedAuthorizationHeader)
  const hasAuthChanges =
    !areAuthConfigsEqual(authPayload, savedAuthPayload) ||
    sendCookiesWithRequests !== savedSendCookiesWithRequests
  const canSaveAuth = hasAuthChanges && (authForm.mode === "none" || Boolean(authForm.key.trim()))

  useEffect(() => {
    setAuthForm(normalizeAuthForm(data?.auth))
    setSendCookiesWithRequests(shouldSendCookies(data?.auth, data?.sendCookiesWithRequests))
  }, [data?.auth, data?.sendCookiesWithRequests])

  const closeHeaderDialog = () => {
    setHeaderDialogOpen(false)
  }

  const handleDiscardAuth = () => {
    setAuthForm(normalizeAuthForm(data?.auth))
    setSendCookiesWithRequests(shouldSendCookies(data?.auth, data?.sendCookiesWithRequests))
  }

  const openHeaderDialog = () => {
    resetHeaderForm()
    setHeaderDialogOpen(true)
  }

  const startEdit = (name: string, header: HeaderConfig[string]) => {
    setHeaderForm({
      name,
      source: header.source as StorageSource,
      key: header.key,
      editingKey: name
    })
    setHeaderDialogOpen(true)
  }

  const handleSaveAuth = async () => {
    if (!canSaveAuth || isSaving) {
      return
    }
    try {
      await saveConfig({
        baseUrl,
        auth: authPayload,
        sendCookiesWithRequests,
        headers
      })
      addToast({
        title: "Auth settings saved",
        description: sendCookiesWithRequests
          ? "Backend requests will include browser cookies."
          : authPayload.mode === "header"
            ? "Authorization header updated."
            : "Backend auth cleared.",
        variant: "success"
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save auth settings"
      addToast({ title: "Save failed", description: message, variant: "error" })
    }
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
    nextHeaders[name] = {
      source: headerForm.source,
      key: headerForm.key.trim()
    }
    try {
      await saveConfig({
        baseUrl,
        auth: buildAuthPayload(authForm),
        sendCookiesWithRequests,
        headers: nextHeaders
      })
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
      await saveConfig({
        baseUrl,
        auth: buildAuthPayload(authForm),
        sendCookiesWithRequests,
        headers: nextHeaders
      })
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
        title="Authentication"
        description="Choose the auth methods your API expects."
        action={hasAuthChanges ? <UnsavedBadge className="h-6" data-testid="auth-dirty-badge" /> : null}
      >
        <div className="space-y-6">
          <section className="rounded-xl border border-border/70 bg-muted/10 p-4" data-testid="auth-settings-card">
            <div className="space-y-4">
              <section className="rounded-lg border border-border/70 bg-background/70 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="pr-4 text-sm font-semibold">Send Authorization header</h3>
                  <Switch
                    id="auth-header-switch"
                    checked={authForm.mode === "header"}
                    onCheckedChange={(checked) =>
                      setAuthForm((current) => ({
                        ...current,
                        mode: checked ? "header" : "none"
                      }))
                    }
                    data-testid="auth-header-switch"
                  />
                </div>

                {authForm.mode === "header" ? (
                  <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Format</Label>
                      <Select
                        value={authForm.authType}
                        onValueChange={(value) =>
                          setAuthForm((current) => ({
                            ...current,
                            authType: value as AuthorizationType
                          }))
                        }
                      >
                        <SelectTrigger data-testid="auth-type-trigger">
                          <SelectValue placeholder="Select auth type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bearer">Bearer</SelectItem>
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="none">No prefix</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Storage</Label>
                      <Select
                        value={authForm.source}
                        onValueChange={(value) =>
                          setAuthForm((current) => ({
                            ...current,
                            source: value as AuthFormState["source"]
                          }))
                        }
                      >
                        <SelectTrigger data-testid="auth-source-trigger">
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
                      <Label htmlFor="auth-key-input">Key</Label>
                      <Input
                        id="auth-key-input"
                        value={authForm.key}
                        onChange={(event) =>
                          setAuthForm((current) => ({
                            ...current,
                            key: event.target.value
                          }))
                        }
                        placeholder="authorization"
                        data-testid="auth-key-input"
                      />
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-border/70 bg-background/70 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="pr-4 text-sm font-semibold">Include cookies on requests</h3>
                  <Switch
                    id="send-cookies-switch"
                    checked={sendCookiesWithRequests}
                    onCheckedChange={setSendCookiesWithRequests}
                    data-testid="send-cookies-switch"
                  />
                </div>
              </section>

              <DirtyActions
                onDiscard={handleDiscardAuth}
                discardDisabled={!hasAuthChanges || isPending || isSaving}
                discardTestId="discard-auth-settings"
                onPrimary={handleSaveAuth}
                primaryDisabled={!canSaveAuth || isPending || isSaving}
                primaryTestId="save-auth-settings"
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Headers</h3>
                <p className="text-sm text-muted-foreground">
                  Optional extra headers.
                </p>
              </div>
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
            </div>
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
                                  className="text-muted-foreground hover:text-destructive"
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
                        No extra headers yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
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
            <DialogDescription>Copy a stored value into a header.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="header-name">Header name</Label>
              <Input
                id="header-name"
                placeholder="X-User-Id"
                value={headerForm.name}
                onChange={(event) => setHeaderForm({ name: event.target.value })}
                data-testid="header-name-input"
              />
              {duplicateHeaderName ? (
                <p className="text-xs text-destructive">Header already exists.</p>
              ) : null}
              {reservedAuthorizationHeader ? (
                <p className="text-xs text-destructive">Configure Authorization in the authentication section above.</p>
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
                placeholder="user_id"
                value={headerForm.key}
                onChange={(event) => setHeaderForm({ key: event.target.value })}
                data-testid="header-key-input"
                className="w-full"
              />
            </div>
          </div>
          {headerForm.source === "cookies" ? (
            <p className="text-sm text-muted-foreground">
              Copies that cookie into this header.
            </p>
          ) : null}
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
