import { useEffect, useMemo } from "react"
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { buildEndpointPayload, mapEndpointToBuilderState } from "@/lib/tool-schema"
import { validateEndpointState } from "./validation"
import { useCreateEndpoint } from "@/queries/use-create-endpoint"
import { useDeleteEndpoint } from "@/queries/use-delete-endpoint"
import { useEndpointsQuery } from "@/queries/use-endpoints"
import { useUpdateEndpoint } from "@/queries/use-update-endpoint"
import { endpointBuilderActions, useEndpointBuilderStore } from "@/stores/endpoint-builder"
import { endpointsUiSelectors, useEndpointsUiStore } from "@/stores/endpoints-ui"
import { toastSelectors, useToastStore } from "@/stores/toast"
import { type HttpMethod } from "@/types"
import { EndpointEditor } from "./EndpointEditor"
import { methodTone } from "./constants"

export const EndpointsPanel = () => {
  const page = useEndpointsUiStore(endpointsUiSelectors.page)
  const pageSize = useEndpointsUiStore(endpointsUiSelectors.pageSize)
  const setPage = useEndpointsUiStore(endpointsUiSelectors.setPage)
  const openCreate = useEndpointsUiStore(endpointsUiSelectors.openCreate)
  const openEdit = useEndpointsUiStore(endpointsUiSelectors.openEdit)
  const closeEditor = useEndpointsUiStore(endpointsUiSelectors.closeEditor)
  const editorOpen = useEndpointsUiStore(endpointsUiSelectors.editorOpen)
  const editingId = useEndpointsUiStore(endpointsUiSelectors.editingId)
  const { data, isPending } = useEndpointsQuery(page, pageSize)
  const endpoints = useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? 0
  const { mutateAsync: deleteEndpoint, isPending: isDeleting } = useDeleteEndpoint()
  const { mutateAsync: createEndpoint, isPending: isCreating } = useCreateEndpoint(pageSize)
  const { mutateAsync: updateEndpoint, isPending: isUpdating } = useUpdateEndpoint()
  const hydrate = useEndpointBuilderStore(endpointBuilderActions.hydrate)
  const resetBuilder = useEndpointBuilderStore(endpointBuilderActions.reset)
  const addToast = useToastStore(toastSelectors.addToast)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    if (!editorOpen) {
      return
    }
    if (editingId && endpoints.length) {
      const match = endpoints.find((item) => item.id === editingId)
      if (match) {
        hydrate(mapEndpointToBuilderState(match))
      }
    } else {
      resetBuilder()
    }
  }, [editorOpen, editingId, endpoints, hydrate, resetBuilder])

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
        setPage(1)
      }
      closeEditor()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save endpoint"
      addToast({ title: "Save failed", description: message, variant: "error" })
    }
  }

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteEndpoint(id)
      addToast({ title: "Endpoint deleted", description: name, variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete endpoint"
      addToast({ title: "Delete failed", description: message, variant: "error" })
    }
  }

  return (
    <PanelShell
      title="Endpoints"
      description="Draft endpoint contracts with a focused editor."
      action={
        <Button
          size="sm"
          onClick={() => {
            resetBuilder()
            openCreate()
          }}
          data-testid="new-endpoint"
        >
          <Plus className="mr-2 h-4 w-4" />
          New endpoint
        </Button>
      }
    >
      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <ActionTooltip content="Previous page">
              <Button
                size="icon"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(Math.max(1, page - 1))}
                data-testid="prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </ActionTooltip>
            <ActionTooltip content="Next page">
              <Button
                size="icon"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                data-testid="next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </ActionTooltip>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-28">Method</TableHead>
                <TableHead className="w-[260px]">Path</TableHead>
                <TableHead className="w-[240px]">Tool name</TableHead>
                <TableHead className="w-[360px]">Description</TableHead>
                <TableHead className="w-32 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={`endpoint-loading-${index}`}>
                    <TableCell className="whitespace-nowrap">
                      <Skeleton className="h-6 w-16" />
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <Skeleton className="h-4 w-full max-w-[220px]" />
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <Skeleton className="h-4 w-full max-w-[200px]" />
                    </TableCell>
                    <TableCell className="max-w-[360px]">
                      <Skeleton className="h-4 w-full max-w-[320px]" />
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="flex justify-end">
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : endpoints.length ? (
                endpoints.map((endpoint) => (
                  <TableRow key={endpoint.id}>
                    <TableCell className="whitespace-nowrap">
                      <Badge className={cn("border", methodTone[endpoint.method as HttpMethod])}>
                        {endpoint.method}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate font-mono text-sm text-muted-foreground" title={endpoint.path}>
                        {endpoint.path}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <div className="truncate font-medium" title={endpoint.tool.function.name}>
                        {endpoint.tool.function.name}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[360px]">
                      <div className="truncate text-muted-foreground" title={endpoint.tool.function.description}>
                        {endpoint.tool.function.description}
                      </div>
                    </TableCell>
                    <TableCell className="flex w-32 justify-end gap-2">
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
                              disabled={isDeleting}
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
                              if (isDeleting) {
                                return
                              }
                              handleDelete(endpoint.id, endpoint.tool.function.name)
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
                              <AlertDialogAction type="submit" disabled={isDeleting}>
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
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Create your first endpoint to start defining your API.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
          <ScrollArea className="max-h-[90vh]">
            <div className="p-6">
              <EndpointEditor
                isSaving={isCreating || isUpdating}
                onClose={() => {
                  closeEditor()
                }}
                onSave={handleSave}
                editing={Boolean(editingId)}
              />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </PanelShell>
  )
}
