import { useEffect, useMemo, useState } from "react"
import { Ban, CornerDownLeft, Loader2, Pencil, Plus, Power, Trash2 } from "lucide-react"

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
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { buildEndpointPayload, mapEndpointToBuilderState } from "@/lib/tool-schema"
import { validateEndpointState } from "./validation"
import { useCreateEndpoint } from "@/queries/use-create-endpoint"
import { useDeleteEndpoint } from "@/queries/use-delete-endpoint"
import { useUpdateEndpoint } from "@/queries/use-update-endpoint"
import { useCreateFeature } from "@/queries/use-create-feature"
import { useDeleteFeature } from "@/queries/use-delete-feature"
import { useFeaturesQuery } from "@/queries/use-features"
import { useToggleFeature } from "@/queries/use-toggle-feature"
import { useUpdateFeature } from "@/queries/use-update-feature"
import { endpointBuilderActions, useEndpointBuilderStore } from "@/stores/endpoint-builder"
import { endpointsUiSelectors, useEndpointsUiStore } from "@/stores/endpoints-ui"
import { toastSelectors, useToastStore } from "@/stores/toast"
import { EndpointEditor } from "./EndpointEditor"
import { methodTone } from "./constants"
import type { EndpointPayload, EndpointResponse, FeatureWithEndpoints, HttpMethod } from "@/types"

const featureStateLabel: Record<string, string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  partial: "Partially enabled"
}

const primaryActionButtonSize = "h-9 min-w-[9rem] max-w-[9rem]"

const toEndpointPayload = (endpoint: EndpointResponse, featureId?: string): EndpointPayload => ({
  path: endpoint.path,
  method: endpoint.method as HttpMethod,
  tool: endpoint.tool,
  agentEnabled: endpoint.agentEnabled,
  feature: { mode: "existing", id: featureId ?? endpoint.feature.id }
})

export const FeaturesPanel = () => {
  const search = useEndpointsUiStore(endpointsUiSelectors.search)
  const searchDraft = useEndpointsUiStore(endpointsUiSelectors.searchDraft)
  const setSearch = useEndpointsUiStore(endpointsUiSelectors.setSearch)
  const setSearchDraft = useEndpointsUiStore(endpointsUiSelectors.setSearchDraft)
  const openCreate = useEndpointsUiStore(endpointsUiSelectors.openCreate)
  const openEdit = useEndpointsUiStore(endpointsUiSelectors.openEdit)
  const closeEditor = useEndpointsUiStore(endpointsUiSelectors.closeEditor)
  const editorOpen = useEndpointsUiStore(endpointsUiSelectors.editorOpen)
  const editingId = useEndpointsUiStore(endpointsUiSelectors.editingId)
  const { data, isPending, isFetching } = useFeaturesQuery(search)
  const features = useMemo(() => data ?? [], [data])
  const { mutateAsync: createEndpoint, isPending: isCreatingEndpoint } = useCreateEndpoint()
  const { mutateAsync: updateEndpoint, isPending: isUpdatingEndpoint } = useUpdateEndpoint()
  const { mutateAsync: deleteEndpoint, isPending: isDeletingEndpoint } = useDeleteEndpoint()
  const { mutateAsync: createFeature, isPending: isCreatingFeature } = useCreateFeature()
  const { mutateAsync: updateFeature, isPending: isRenamingFeature } = useUpdateFeature()
  const { mutateAsync: deleteFeature, isPending: isDeletingFeature } = useDeleteFeature()
  const { mutateAsync: toggleFeature, isPending: isTogglingFeature } = useToggleFeature()
  const hydrate = useEndpointBuilderStore(endpointBuilderActions.hydrate)
  const resetBuilder = useEndpointBuilderStore(endpointBuilderActions.reset)
  const setFeatureMode = useEndpointBuilderStore(endpointBuilderActions.setFeatureMode)
  const setFeatureId = useEndpointBuilderStore(endpointBuilderActions.setFeatureId)
  const setFeatureName = useEndpointBuilderStore(endpointBuilderActions.setFeatureName)
  const addToast = useToastStore(toastSelectors.addToast)
  const [pendingEndpointToggles, setPendingEndpointToggles] = useState<Record<string, boolean>>({})
  const [pendingFeatureToggles, setPendingFeatureToggles] = useState<Record<string, boolean>>({})
  const [newFeatureOpen, setNewFeatureOpen] = useState(false)
  const [newFeatureName, setNewFeatureName] = useState("")
  const [renameTarget, setRenameTarget] = useState<FeatureWithEndpoints | null>(null)
  const [renameValue, setRenameValue] = useState("")

  const allEndpoints = useMemo(() => features.flatMap((feature) => feature.endpoints ?? []), [features])
  const showSearchLoading = isFetching && Boolean(search.trim())
  const isSavingEndpoint = isCreatingEndpoint || isUpdatingEndpoint

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchDraft), 250)
    return () => clearTimeout(handle)
  }, [searchDraft, setSearch])

  useEffect(() => {
    if (!editorOpen || !editingId) return
    if (!allEndpoints.length) return
    const match = allEndpoints.find((item) => item.id === editingId)
    if (match) {
      hydrate(mapEndpointToBuilderState(match))
    }
  }, [editorOpen, editingId, allEndpoints, hydrate])

  const startCreateEndpoint = (featureId?: string) => {
    resetBuilder()
    if (featureId) {
      setFeatureId(featureId)
      setFeatureMode("existing")
    } else if (!features.length) {
      setFeatureMode("new")
      setFeatureName("")
    } else {
      setFeatureMode("auto")
      setFeatureId(null)
    }
    openCreate()
  }

  const handleSave = async () => {
    const builderState = useEndpointBuilderStore.getState()
    const validation = validateEndpointState(builderState)
    if (validation.errors.length) {
      return
    }
    const payload = buildEndpointPayload(builderState)
    try {
      if (editingId) {
        await updateEndpoint({ id: editingId, payload })
        addToast({ title: "Endpoint updated", description: payload.tool.function.name, variant: "success" })
      } else {
        await createEndpoint(payload)
        addToast({ title: "Endpoint created", description: payload.tool.function.name, variant: "success" })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save endpoint"
      addToast({ title: "Save failed", description: message, variant: "error" })
    } finally {
      closeEditor()
    }
  }

  const handleDeleteEndpoint = async (endpoint: EndpointResponse) => {
    try {
      await deleteEndpoint(endpoint.id)
      addToast({ title: "Endpoint deleted", description: endpoint.tool.function.name, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete endpoint"
      addToast({ title: "Delete failed", description: message, variant: "error" })
    }
  }

  const handleMoveEndpoint = async (endpoint: EndpointResponse, targetFeatureId: string) => {
    if (endpoint.feature.id === targetFeatureId) return
    const payload = { ...toEndpointPayload(endpoint, targetFeatureId), agentEnabled: endpoint.agentEnabled }
    try {
      await updateEndpoint({ id: endpoint.id, payload })
      addToast({ title: "Endpoint moved", description: endpoint.tool.function.name, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not move endpoint"
      addToast({ title: "Move failed", description: message, variant: "error" })
    }
  }

  const handleEndpointToggle = async (endpoint: EndpointResponse, enabled: boolean) => {
    if (endpoint.agentEnabled === enabled) return
    setPendingEndpointToggles((current) => ({ ...current, [endpoint.id]: true }))
    const payload = { ...toEndpointPayload(endpoint), agentEnabled: enabled }
    try {
      await updateEndpoint({ id: endpoint.id, payload })
      addToast({ title: enabled ? "Endpoint enabled" : "Endpoint disabled", description: endpoint.tool.function.name, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update endpoint"
      addToast({ title: "Update failed", description: message, variant: "error" })
    } finally {
      setPendingEndpointToggles((current) => {
        const next = { ...current }
        delete next[endpoint.id]
        return next
      })
    }
  }

  const handleFeatureToggle = async (feature: FeatureWithEndpoints, enabled: boolean) => {
    setPendingFeatureToggles((current) => ({ ...current, [feature.id]: true }))
    try {
      await toggleFeature({ id: feature.id, payload: { agentEnabled: enabled } })
      addToast({ title: enabled ? "Feature enabled" : "Feature disabled", description: feature.name, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update feature"
      addToast({ title: "Update failed", description: message, variant: "error" })
    } finally {
      setPendingFeatureToggles((current) => {
        const next = { ...current }
        delete next[feature.id]
        return next
      })
    }
  }

  const handleCreateFeature = async () => {
    const name = newFeatureName.trim()
    if (!name) return
    try {
      await createFeature({ name })
      addToast({ title: "Feature created", description: name, variant: "success" })
      setNewFeatureName("")
      setNewFeatureOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create feature"
      addToast({ title: "Create failed", description: message, variant: "error" })
    }
  }

  const handleRenameFeature = async () => {
    if (!renameTarget) return
    const name = renameValue.trim()
    if (!name) return
    try {
      await updateFeature({ id: renameTarget.id, payload: { name } })
      addToast({ title: "Feature renamed", description: name, variant: "success" })
      setRenameTarget(null)
      setRenameValue("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not rename feature"
      addToast({ title: "Rename failed", description: message, variant: "error" })
    }
  }

  const handleDeleteFeature = async (feature: FeatureWithEndpoints) => {
    try {
      await deleteFeature(feature.id)
      addToast({ title: "Feature deleted", description: feature.name, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete feature"
      addToast({ title: "Delete failed", description: message, variant: "error" })
    }
  }

  return (
    <PanelShell
      title="Features"
      description="Classify endpoints into features and manage them together."
      action={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNewFeatureOpen(true)}
            className={primaryActionButtonSize}
            data-testid="new-feature"
          >
            <Plus className="mr-2 h-4 w-4" />
            New feature
          </Button>
          <Button
            size="sm"
            onClick={() => startCreateEndpoint()}
            className={primaryActionButtonSize}
            data-testid="new-endpoint"
          >
            <Plus className="mr-2 h-4 w-4" />
            New endpoint
          </Button>
        </div>
      }
    >
      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <Input
              placeholder="Search features or endpoints"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              className="w-full md:w-80 transition-shadow focus-visible:shadow-[0_0_0_2px_var(--ring)]"
              data-testid="feature-search"
              suffix={
                showSearchLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" data-testid="feature-search-loading" />
                ) : null
              }
            />
          </div>
        </div>
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`feature-loading-${index}`} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-9 w-24" />
                </div>
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : features.length ? (
          <div className="space-y-4">
            {features.map((feature) => {
              const endpointCount = feature.endpointCount ?? feature.endpoints.length
              const hasEndpoints = endpointCount > 0
              return (
                <div key={feature.id} className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold" data-testid={`feature-name-${feature.id}`}>
                          {feature.name}
                        </p>
                        <Badge
                          variant={feature.enabledState === "disabled" ? "secondary" : feature.enabledState === "partial" ? "outline" : "default"}
                          className="border"
                        >
                          {featureStateLabel[feature.enabledState] ?? feature.enabledState}
                        </Badge>
                        {endpointCount > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {endpointCount} {endpointCount === 1 ? "endpoint" : "endpoints"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {hasEndpoints && (
                        <>
                          <ActionTooltip content="Enable all endpoints">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => handleFeatureToggle(feature, true)}
                              disabled={pendingFeatureToggles[feature.id] || isTogglingFeature}
                              aria-label="Enable all endpoints"
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          </ActionTooltip>
                          <ActionTooltip content="Disable all endpoints">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => handleFeatureToggle(feature, false)}
                              disabled={pendingFeatureToggles[feature.id] || isTogglingFeature}
                              aria-label="Disable all endpoints"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </ActionTooltip>
                        </>
                      )}
                      <ActionTooltip content="New endpoint in this feature">
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={() => startCreateEndpoint(feature.id)}
                          data-testid={`new-endpoint-${feature.id}`}
                          aria-label="New endpoint"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </ActionTooltip>
                      <ActionTooltip content="Rename feature">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setRenameTarget(feature)
                            setRenameValue(feature.name)
                          }}
                          data-testid={`rename-feature-${feature.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </ActionTooltip>
                      <AlertDialog>
                        <ActionTooltip content="Delete feature">
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={isDeletingFeature}
                              data-testid={`delete-feature-${feature.id}`}
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
                              if (isDeletingFeature) return
                              handleDeleteFeature(feature)
                            }}
                          >
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this feature?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Deleting {feature.name} removes its endpoints.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                              <AlertDialogAction type="submit" disabled={isDeletingFeature}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </form>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {feature.endpoints.length ? (
                      feature.endpoints.map((endpoint) => (
                        <div
                          key={endpoint.id}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3"
                        >
                          <Badge className={cn("border", methodTone[endpoint.method as HttpMethod])}>{endpoint.method}</Badge>
                          <div className="min-w-[200px] flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate font-medium" title={endpoint.tool.function.name}>
                                {endpoint.tool.function.name}
                              </div>
                              <div className="truncate font-mono text-xs text-muted-foreground" title={endpoint.path}>
                                {endpoint.path}
                              </div>
                            </div>
                            <div className="truncate text-xs text-muted-foreground" title={endpoint.tool.function.description}>
                              {endpoint.tool.function.description}
                            </div>
                          </div>
                          <div className="min-w-[160px]">
                            <Select value={endpoint.feature.id} onValueChange={(value) => handleMoveEndpoint(endpoint, value)}>
                              <SelectTrigger
                                data-testid={`move-endpoint-${endpoint.id}`}
                                className="w-48 px-3 pr-8"
                              >
                                <span className="block flex-1 min-w-0 truncate text-left">
                                  <SelectValue />
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                {features.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={endpoint.agentEnabled}
                              onCheckedChange={(checked) => handleEndpointToggle(endpoint, checked)}
                              disabled={pendingEndpointToggles[endpoint.id] || isUpdatingEndpoint}
                              data-testid={`agent-toggle-${endpoint.id}`}
                            />
                            <span className="text-xs text-muted-foreground">{endpoint.agentEnabled ? "Enabled" : "Disabled"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <ActionTooltip content="Edit endpoint">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEdit(endpoint.id)}
                                data-testid={`edit-endpoint-${endpoint.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </ActionTooltip>
                            <AlertDialog>
                              <ActionTooltip content="Delete endpoint">
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={isDeletingEndpoint}
                                    data-testid={`delete-endpoint-${endpoint.id}`}
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
                                    if (isDeletingEndpoint) return
                                    handleDeleteEndpoint(endpoint)
                                  }}
                                >
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this endpoint?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete {endpoint.tool.function.name}?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                                    <AlertDialogAction type="submit" disabled={isDeletingEndpoint}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </form>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                        No endpoints in this feature yet.
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
            Create a feature or auto-classify a new endpoint to get started.
          </div>
        )}
      </div>
      <Dialog
        open={editorOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeEditor()
          }
        }}
      >
        <DialogContent className="max-w-5xl w-[min(1200px,95vw)] max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{editingId ? "Edit endpoint" : "New endpoint"}</DialogTitle>
            <DialogDescription>Configure an endpoint for your agent.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[90vh]">
            <div className="p-6">
              <EndpointEditor
                isSaving={isSavingEndpoint}
                onClose={() => {
                  closeEditor()
                }}
                onSave={handleSave}
                editing={Boolean(editingId)}
                features={features}
              />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <Dialog
        open={newFeatureOpen}
        onOpenChange={(open) => {
          setNewFeatureOpen(open)
          if (!open) setNewFeatureName("")
        }}
      >
        <DialogContent className="max-w-md">
          <form
            className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            handleCreateFeature()
          }}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle>New feature</DialogTitle>
            <DialogDescription>Create a feature to group endpoints.</DialogDescription>
          </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="new-feature-name">Feature name</Label>
              <Input
                id="new-feature-name"
                value={newFeatureName}
                onChange={(event) => setNewFeatureName(event.target.value)}
                placeholder="User Management"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setNewFeatureOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newFeatureName.trim() || isCreatingFeature}>
                Create
                <CornerDownLeft className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null)
            setRenameValue("")
          }
        }}
      >
        <DialogContent className="max-w-md">
          <form
            className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            handleRenameFeature()
          }}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle>Rename feature</DialogTitle>
            <DialogDescription>Give this feature a new name.</DialogDescription>
          </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="rename-feature-name">Feature name</Label>
              <Input
                id="rename-feature-name"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setRenameTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameValue.trim() || isRenamingFeature}>
                Save
                <CornerDownLeft className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PanelShell>
  )
}

export { FeaturesPanel as EndpointsPanel }
