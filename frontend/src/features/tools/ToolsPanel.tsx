import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
} from "lucide-react";

import { ActionTooltip } from "@/components/action-tooltip";
import { PanelShell } from "@/components/panel-shell";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  buildToolPayload,
  mapToolToBuilderState,
} from "@/lib/tool-schema";
import { validateToolState } from "./validation";
import { useCreateTool } from "@/queries/use-create-tool";
import { useDeleteTool } from "@/queries/use-delete-tool";
import { useUpdateTool } from "@/queries/use-update-tool";
import { useCreateFeature } from "@/queries/use-create-feature";
import { useDeleteFeature } from "@/queries/use-delete-feature";
import { useFeatureToolsQuery } from "@/queries/use-feature-tools";
import { useFeaturesQuery } from "@/queries/use-features";
import { useToggleFeature } from "@/queries/use-toggle-feature";
import { useUpdateFeature } from "@/queries/use-update-feature";
import {
  toolBuilderActions,
  useToolBuilderStore,
} from "@/stores/tool-builder";
import {
  toolsUiSelectors,
  useToolsUiStore,
} from "@/stores/tools-ui";
import { toastSelectors, useToastStore } from "@/stores/toast";
import { ToolEditor } from "./ToolEditor";
import { frontendTone, methodTone } from "./constants";
import type {
  ToolPayload,
  ToolResponse,
  FeatureWithTools,
  HttpMethod,
} from "@/types";

const featureStateLabel: Record<string, string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  partial: "Partially enabled",
};

const primaryActionButtonSize = "h-9 min-w-[9rem] max-w-[9rem]";

const toToolPayload = (
  tool: ToolResponse,
  featureId?: string,
): ToolPayload => {
  const toolType = tool.toolType ?? "backend";
  const payload: ToolPayload = {
    toolType,
    tool: tool.tool,
    agentEnabled: tool.agentEnabled,
    feature: { mode: "existing", id: featureId ?? tool.feature.id },
  };
  if (toolType === "backend") {
    payload.path = tool.path ?? "/";
    payload.method = (tool.method as HttpMethod) ?? "GET";
  }
  return payload;
};

type FeatureCardProps = {
  feature: FeatureWithTools;
  features: FeatureWithTools[];
  currentPage: number;
  onPageChange: (page: number) => void;
  pendingFeatureToggles: Record<string, boolean>;
  pendingToolToggles: Record<string, boolean>;
  isTogglingFeature: boolean;
  isUpdatingTool: boolean;
  isDeletingFeature: boolean;
  isDeletingTool: boolean;
  onFeatureToggle: (feature: FeatureWithTools, enabled: boolean) => void;
  onToolToggle: (tool: ToolResponse, enabled: boolean) => void;
  onMoveTool: (tool: ToolResponse, targetFeatureId: string) => void;
  onDeleteTool: (tool: ToolResponse) => void;
  onDeleteFeature: (feature: FeatureWithTools) => void;
  onEditTool: (tool: ToolResponse) => void;
  onCreateTool: (featureId: string) => void;
  onRenameFeature: (feature: FeatureWithTools) => void;
};

const FeatureCard = ({
  feature,
  features,
  currentPage,
  onPageChange,
  pendingFeatureToggles,
  pendingToolToggles,
  isTogglingFeature,
  isUpdatingTool,
  isDeletingFeature,
  isDeletingTool,
  onFeatureToggle,
  onToolToggle,
  onMoveTool,
  onDeleteTool,
  onDeleteFeature,
  onEditTool,
  onCreateTool,
  onRenameFeature,
}: FeatureCardProps) => {
  const { data: paginatedData, isFetching: isFetchingPage } =
    useFeatureToolsQuery(feature.id, currentPage, currentPage > 1);

  const tools =
    currentPage > 1 && paginatedData
      ? paginatedData.items
      : feature.tools;
  const pagination =
    currentPage > 1 && paginatedData ? paginatedData : feature.pagination;
  const toolCount = feature.toolCount;
  const hasTools = toolCount > 0;
  const showPagination = toolCount > pagination.pageSize;

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className="text-base font-semibold"
              data-testid={`feature-name-${feature.id}`}
            >
              {feature.name}
            </p>
            <Badge
              variant={
                feature.enabledState === "disabled"
                  ? "secondary"
                  : feature.enabledState === "partial"
                    ? "outline"
                    : "default"
              }
              className="border"
            >
              {featureStateLabel[feature.enabledState] ?? feature.enabledState}
            </Badge>
            {toolCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                {toolCount} {toolCount === 1 ? "tool" : "tools"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasTools && (
            <>
              <ActionTooltip content="Enable all tools">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onFeatureToggle(feature, true)}
                  disabled={
                    pendingFeatureToggles[feature.id] || isTogglingFeature
                  }
                  aria-label="Enable all tools"
                >
                  <Power className="h-4 w-4" />
                </Button>
              </ActionTooltip>
              <ActionTooltip content="Disable all tools">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onFeatureToggle(feature, false)}
                  disabled={
                    pendingFeatureToggles[feature.id] || isTogglingFeature
                  }
                  aria-label="Disable all tools"
                >
                  <Ban className="h-4 w-4" />
                </Button>
              </ActionTooltip>
            </>
          )}
          <ActionTooltip content="New tool in this feature">
            <Button
              size="icon"
              variant="secondary"
              onClick={() => onCreateTool(feature.id)}
              data-testid={`new-tool-${feature.id}`}
              aria-label="New tool"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </ActionTooltip>
          <ActionTooltip content="Rename feature">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onRenameFeature(feature)}
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
                  event.preventDefault();
                  if (isDeletingFeature) return;
                  onDeleteFeature(feature);
                }}
              >
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this feature?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Deleting {feature.name} removes its tools.
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
        {isFetchingPage && currentPage > 1 ? (
          <div className="space-y-2">
            {Array.from({
              length: Math.min(
                pagination.pageSize,
                toolCount - (currentPage - 1) * pagination.pageSize,
              ),
            }).map((_, i) => (
              <Skeleton
                key={`tool-skeleton-${i}`}
                className="h-16 w-full rounded-xl"
              />
            ))}
          </div>
        ) : tools.length ? (
          tools.map((tool) => (
            <div
              key={tool.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3"
            >
              {(tool.toolType ?? "backend") === "backend" ? (
                <Badge
                  className={cn(
                    "border",
                    methodTone[(tool.method as HttpMethod) ?? "GET"],
                  )}
                >
                  {(tool.method as HttpMethod) ?? "GET"}
                </Badge>
              ) : (
                <Badge variant="outline" className={cn("border", frontendTone)}>
                  Frontend
                </Badge>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="truncate font-medium"
                    title={tool.tool.function.name}
                  >
                    {tool.tool.function.name}
                  </div>
                  <div
                    className="truncate font-mono text-xs text-muted-foreground"
                    title={
                      (tool.toolType ?? "backend") === "backend"
                        ? (tool.path ?? "/")
                        : `window.warpy('${tool.tool.function.name}', vars)`
                    }
                  >
                    {(tool.toolType ?? "backend") === "backend"
                      ? (tool.path ?? "/")
                      : `window.warpy('${tool.tool.function.name}', vars)`}
                  </div>
                </div>
                <div
                  className="line-clamp-1 break-all text-xs text-muted-foreground"
                  title={tool.tool.function.description}
                >
                  {tool.tool.function.description}
                </div>
              </div>
              <div className="min-w-[160px]">
                <Select
                  value={tool.feature.id}
                  onValueChange={(value) => onMoveTool(tool, value)}
                >
                  <SelectTrigger
                    data-testid={`move-tool-${tool.id}`}
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
                  checked={tool.agentEnabled}
                  onCheckedChange={(checked) =>
                    onToolToggle(tool, checked)
                  }
                  disabled={
                    pendingToolToggles[tool.id] || isUpdatingTool
                  }
                  data-testid={`agent-toggle-${tool.id}`}
                />
                <span className="text-xs text-muted-foreground">
                  {tool.agentEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ActionTooltip content="Edit tool">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onEditTool(tool)}
                    data-testid={`edit-tool-${tool.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </ActionTooltip>
                <AlertDialog>
                  <ActionTooltip content="Delete tool">
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={isDeletingTool}
                        data-testid={`delete-tool-${tool.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                  </ActionTooltip>
                  <AlertDialogContent>
                    <form
                      className="grid gap-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (isDeletingTool) return;
                        onDeleteTool(tool);
                      }}
                    >
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Delete this tool?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete{" "}
                          {tool.tool.function.name}?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel type="button">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          type="submit"
                          disabled={isDeletingTool}
                        >
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
            No tools in this feature yet.
          </div>
        )}
      </div>
      {showPagination && (
        <div className="flex items-center justify-between border-t border-border/50 pt-3">
          <span className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || isFetchingPage}
              data-testid={`prev-page-${feature.id}`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={!pagination.hasMore || isFetchingPage}
              data-testid={`next-page-${feature.id}`}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export const ToolsPanel = () => {
  const search = useToolsUiStore(toolsUiSelectors.search);
  const searchDraft = useToolsUiStore(toolsUiSelectors.searchDraft);
  const setSearch = useToolsUiStore(toolsUiSelectors.setSearch);
  const setSearchDraft = useToolsUiStore(
    toolsUiSelectors.setSearchDraft,
  );
  const openCreate = useToolsUiStore(toolsUiSelectors.openCreate);
  const openEdit = useToolsUiStore(toolsUiSelectors.openEdit);
  const closeEditor = useToolsUiStore(toolsUiSelectors.closeEditor);
  const editorOpen = useToolsUiStore(toolsUiSelectors.editorOpen);
  const editingId = useToolsUiStore(toolsUiSelectors.editingId);
  const editingTool = useToolsUiStore(
    toolsUiSelectors.editingTool,
  );
  const { data, isPending, isFetching } = useFeaturesQuery(search);
  const features = useMemo(() => data ?? [], [data]);
  const { mutateAsync: createTool, isPending: isCreatingTool } =
    useCreateTool();
  const { mutateAsync: updateTool, isPending: isUpdatingTool } =
    useUpdateTool();
  const { mutateAsync: deleteTool, isPending: isDeletingTool } =
    useDeleteTool();
  const { mutateAsync: createFeature, isPending: isCreatingFeature } =
    useCreateFeature();
  const { mutateAsync: updateFeature, isPending: isRenamingFeature } =
    useUpdateFeature();
  const { mutateAsync: deleteFeature, isPending: isDeletingFeature } =
    useDeleteFeature();
  const { mutateAsync: toggleFeature, isPending: isTogglingFeature } =
    useToggleFeature();
  const hydrate = useToolBuilderStore(toolBuilderActions.hydrate);
  const resetBuilder = useToolBuilderStore(toolBuilderActions.reset);
  const setFeatureMode = useToolBuilderStore(
    toolBuilderActions.setFeatureMode,
  );
  const setFeatureId = useToolBuilderStore(
    toolBuilderActions.setFeatureId,
  );
  const setFeatureName = useToolBuilderStore(
    toolBuilderActions.setFeatureName,
  );
  const addToast = useToastStore(toastSelectors.addToast);
  const [pendingToolToggles, setPendingToolToggles] = useState<
    Record<string, boolean>
  >({});
  const [pendingFeatureToggles, setPendingFeatureToggles] = useState<
    Record<string, boolean>
  >({});
  const [newFeatureOpen, setNewFeatureOpen] = useState(false);
  const [newFeatureName, setNewFeatureName] = useState("");
  const [renameTarget, setRenameTarget] = useState<FeatureWithTools | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [featurePages, setFeaturePages] = useState<Record<string, number>>({});

  const getFeaturePage = useCallback(
    (featureId: string) => featurePages[featureId] ?? 1,
    [featurePages],
  );
  const setFeaturePage = useCallback((featureId: string, page: number) => {
    setFeaturePages((prev) => ({ ...prev, [featureId]: page }));
  }, []);

  const showSearchLoading = isFetching && Boolean(search.trim());
  const isSavingTool = isCreatingTool || isUpdatingTool;

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchDraft), 250);
    return () => clearTimeout(handle);
  }, [searchDraft, setSearch]);

  useEffect(() => {
    if (!editorOpen || !editingTool) return;
    hydrate(mapToolToBuilderState(editingTool));
  }, [editorOpen, editingTool, hydrate]);

  const startCreateTool = (featureId?: string) => {
    resetBuilder();
    if (featureId) {
      setFeatureId(featureId);
      setFeatureMode("existing");
    } else {
      setFeatureMode(features.length ? "auto" : "new");
      setFeatureId(null);
      setFeatureName("");
    }
    openCreate();
  };

  const handleSave = async () => {
    const builderState = useToolBuilderStore.getState();
    const validation = validateToolState(builderState);
    if (validation.errors.length) {
      addToast({
        title: "Validation failed",
        description: validation.errors[0],
        variant: "error",
      });
      return;
    }
    const payload = buildToolPayload(builderState);
    try {
      if (editingId) {
        await updateTool({ id: editingId, payload });
        addToast({
          title: "Tool updated",
          description: payload.tool.function.name,
          variant: "success",
        });
      } else {
        await createTool(payload);
        addToast({
          title: "Tool created",
          description: payload.tool.function.name,
          variant: "success",
        });
      }
      closeEditor();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save tool";
      addToast({
        title: "Save failed",
        description: message,
        variant: "error",
      });
    }
  };

  const handleDeleteTool = async (tool: ToolResponse) => {
    const featureId = tool.feature.id;
    const feature = features.find((f) => f.id === featureId);
    const currentPage = getFeaturePage(featureId);
    try {
      await deleteTool(tool.id);
      if (feature && currentPage > 1) {
        const remainingTools = feature.toolCount - 1;
        const pageSize = feature.pagination.pageSize;
        const newTotalPages = Math.max(
          1,
          Math.ceil(remainingTools / pageSize),
        );
        if (currentPage > newTotalPages) {
          setFeaturePage(featureId, newTotalPages);
        }
      }
      addToast({
        title: "Tool deleted",
        description: tool.tool.function.name,
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not delete tool";
      addToast({
        title: "Delete failed",
        description: message,
        variant: "error",
      });
    }
  };

  const handleMoveTool = async (
    tool: ToolResponse,
    targetFeatureId: string,
  ) => {
    if (tool.feature.id === targetFeatureId) return;
    const sourceFeatureId = tool.feature.id;
    const sourceFeature = features.find((f) => f.id === sourceFeatureId);
    const sourcePage = getFeaturePage(sourceFeatureId);
    const payload = {
      ...toToolPayload(tool, targetFeatureId),
      agentEnabled: tool.agentEnabled,
    };
    try {
      await updateTool({ id: tool.id, payload });
      if (sourceFeature && sourcePage > 1) {
        const remainingTools = sourceFeature.toolCount - 1;
        const pageSize = sourceFeature.pagination.pageSize;
        const newTotalPages = Math.max(
          1,
          Math.ceil(remainingTools / pageSize),
        );
        if (sourcePage > newTotalPages) {
          setFeaturePage(sourceFeatureId, newTotalPages);
        }
      }
      addToast({
        title: "Tool moved",
        description: tool.tool.function.name,
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not move tool";
      addToast({
        title: "Move failed",
        description: message,
        variant: "error",
      });
    }
  };

  const handleToolToggle = async (
    tool: ToolResponse,
    enabled: boolean,
  ) => {
    if (tool.agentEnabled === enabled) return;
    setPendingToolToggles((current) => ({
      ...current,
      [tool.id]: true,
    }));
    const payload = { ...toToolPayload(tool), agentEnabled: enabled };
    try {
      await updateTool({ id: tool.id, payload });
      addToast({
        title: enabled ? "Tool enabled" : "Tool disabled",
        description: tool.tool.function.name,
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not update tool";
      addToast({
        title: "Update failed",
        description: message,
        variant: "error",
      });
    } finally {
      setPendingToolToggles((current) => {
        const next = { ...current };
        delete next[tool.id];
        return next;
      });
    }
  };

  const handleFeatureToggle = async (
    feature: FeatureWithTools,
    enabled: boolean,
  ) => {
    setPendingFeatureToggles((current) => ({ ...current, [feature.id]: true }));
    try {
      await toggleFeature({
        id: feature.id,
        payload: { agentEnabled: enabled },
      });
      addToast({
        title: enabled ? "Feature enabled" : "Feature disabled",
        description: feature.name,
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not update feature";
      addToast({
        title: "Update failed",
        description: message,
        variant: "error",
      });
    } finally {
      setPendingFeatureToggles((current) => {
        const next = { ...current };
        delete next[feature.id];
        return next;
      });
    }
  };

  const handleCreateFeature = async () => {
    const name = newFeatureName.trim();
    if (!name) return;
    try {
      await createFeature({ name });
      addToast({
        title: "Feature created",
        description: name,
        variant: "success",
      });
      setNewFeatureName("");
      setNewFeatureOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create feature";
      addToast({
        title: "Create failed",
        description: message,
        variant: "error",
      });
    }
  };

  const handleRenameFeature = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    try {
      await updateFeature({ id: renameTarget.id, payload: { name } });
      addToast({
        title: "Feature renamed",
        description: name,
        variant: "success",
      });
      setRenameTarget(null);
      setRenameValue("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not rename feature";
      addToast({
        title: "Rename failed",
        description: message,
        variant: "error",
      });
    }
  };

  const handleDeleteFeature = async (feature: FeatureWithTools) => {
    try {
      await deleteFeature(feature.id);
      addToast({
        title: "Feature deleted",
        description: feature.name,
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not delete feature";
      addToast({
        title: "Delete failed",
        description: message,
        variant: "error",
      });
    }
  };

  return (
    <PanelShell
      title="Features"
      description="Group and manage backend and frontend tools."
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
            onClick={() => startCreateTool()}
            className={primaryActionButtonSize}
            data-testid="new-tool"
          >
            <Plus className="mr-2 h-4 w-4" />
            New tool
          </Button>
        </div>
      }
    >
      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <div className="relative w-full md:w-80">
              <Input
                placeholder="Search features or tools"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                className="w-full pr-9 transition-shadow focus-visible:shadow-[0_0_0_2px_var(--ring)]"
                data-testid="feature-search"
              />
              {showSearchLoading ? (
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    data-testid="feature-search-loading"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {isPending ? (
          <div className="space-y-3" data-testid="tools-loading">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`feature-loading-${index}`}
                className="rounded-2xl border border-border/60 bg-muted/20 p-4"
              >
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
            {features.map((feature) => (
              <FeatureCard
                key={feature.id}
                feature={feature}
                features={features}
                currentPage={getFeaturePage(feature.id)}
                onPageChange={(page) => setFeaturePage(feature.id, page)}
                pendingFeatureToggles={pendingFeatureToggles}
                pendingToolToggles={pendingToolToggles}
                isTogglingFeature={isTogglingFeature}
                isUpdatingTool={isUpdatingTool}
                isDeletingFeature={isDeletingFeature}
                isDeletingTool={isDeletingTool}
                onFeatureToggle={handleFeatureToggle}
                onToolToggle={handleToolToggle}
                onMoveTool={handleMoveTool}
                onDeleteTool={handleDeleteTool}
                onDeleteFeature={handleDeleteFeature}
                onEditTool={openEdit}
                onCreateTool={startCreateTool}
                onRenameFeature={(f) => {
                  setRenameTarget(f);
                  setRenameValue(f.name);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
            Create a feature or add a new tool to get started.
          </div>
        )}
      </div>
      <Dialog
        open={editorOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeEditor();
          }
        }}
      >
        <DialogContent className="max-w-[98vw] w-[min(1500px,98vw)] h-[94vh] max-h-[94vh] overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {editingId ? "Edit tool" : "New tool"}
            </DialogTitle>
            <DialogDescription>
              Configure a tool for your agent.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-full">
            <div className="p-6">
              <ToolEditor
                isSaving={isSavingTool}
                onClose={() => {
                  closeEditor();
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
          setNewFeatureOpen(open);
          if (!open) setNewFeatureName("");
        }}
      >
        <DialogContent className="max-w-md">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateFeature();
            }}
          >
            <DialogHeader className="space-y-1">
              <DialogTitle>New feature</DialogTitle>
              <DialogDescription>
                Create a feature to group tools.
              </DialogDescription>
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
              <Button
                variant="outline"
                type="button"
                onClick={() => setNewFeatureOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newFeatureName.trim() || isCreatingFeature}
              >
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
            setRenameTarget(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleRenameFeature();
            }}
          >
            <DialogHeader className="space-y-1">
              <DialogTitle>Rename feature</DialogTitle>
              <DialogDescription>
                Give this feature a new name.
              </DialogDescription>
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
              <Button
                variant="outline"
                type="button"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!renameValue.trim() || isRenamingFeature}
              >
                Save
                <CornerDownLeft className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PanelShell>
  );
};
