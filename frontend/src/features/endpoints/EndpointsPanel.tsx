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
import { cn } from "@/lib/utils"
import { buildEndpointPayload, mapEndpointToBuilderState } from "@/lib/tool-schema"
import { useCreateEndpoint } from "@/queries/use-create-endpoint"
import { useDeleteEndpoint } from "@/queries/use-delete-endpoint"
import { useEndpointsQuery } from "@/queries/use-endpoints"
import { useUpdateEndpoint } from "@/queries/use-update-endpoint"
import { endpointBuilderActions, useEndpointBuilderStore } from "@/stores/endpoint-builder"
import { endpointsUiSelectors, useEndpointsUiStore } from "@/stores/endpoints-ui"
import { type HttpMethod } from "@/types"
import { EndpointEditor } from "./EndpointEditor"
import { endpointNamePattern, methodTone } from "./constants"

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    if (!editorOpen) {
      resetBuilder()
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
    const payload = buildEndpointPayload(builderState)
    if (
      !payload.path.trim() ||
      !payload.tool.function.name ||
      !payload.tool.function.description ||
      !endpointNamePattern.test(payload.tool.function.name)
    ) {
      return
    }
    if (editingId) {
      await updateEndpoint({ id: editingId, payload })
    } else {
      await createEndpoint(payload)
      setPage(1)
    }
    closeEditor()
    resetBuilder()
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
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
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
                  <TableHead className="w-64">Path</TableHead>
                  <TableHead>Tool name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Loading endpoints...
                    </TableCell>
                  </TableRow>
                ) : endpoints.length ? (
                  endpoints.map((endpoint) => (
                    <TableRow key={endpoint.id}>
                      <TableCell>
                        <Badge className={cn("border", methodTone[endpoint.method as HttpMethod])}>
                          {endpoint.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {endpoint.path}
                      </TableCell>
                      <TableCell className="font-medium">{endpoint.tool.function.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {endpoint.tool.function.description}
                      </TableCell>
                      <TableCell className="flex justify-end gap-2">
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
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this endpoint?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Remove {endpoint.tool.function.name}. Any drafts using it will be cleared.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteEndpoint(endpoint.id)} disabled={isDeleting}>
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
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No endpoints yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <EndpointEditor
          open={editorOpen}
          isSaving={isCreating || isUpdating}
          onClose={() => {
            closeEditor()
            resetBuilder()
          }}
          onSave={handleSave}
          editing={Boolean(editingId)}
        />
      </div>
    </PanelShell>
  )
}
