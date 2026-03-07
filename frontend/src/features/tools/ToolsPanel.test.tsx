/// <reference types="@testing-library/jest-dom" />
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ToolsPanel } from "./ToolsPanel";
import {
  toolsUiSelectors,
  useToolsUiStore,
} from "@/stores/tools-ui";

jest.mock("@/queries/use-features", () => ({
  useFeaturesQuery: jest.fn(),
}));

jest.mock("@/queries/use-feature-tools", () => ({
  useFeatureToolsQuery: jest.fn(),
}));

jest.mock("@/queries/use-create-feature", () => ({
  useCreateFeature: jest.fn(),
}));

jest.mock("@/queries/use-update-feature", () => ({
  useUpdateFeature: jest.fn(),
}));

jest.mock("@/queries/use-delete-feature", () => ({
  useDeleteFeature: jest.fn(),
}));

jest.mock("@/queries/use-toggle-feature", () => ({
  useToggleFeature: jest.fn(),
}));

jest.mock("@/queries/use-delete-tool", () => ({
  useDeleteTool: jest.fn(),
}));

jest.mock("@/queries/use-create-tool", () => ({
  useCreateTool: jest.fn(),
}));

jest.mock("@/queries/use-update-tool", () => ({
  useUpdateTool: jest.fn(),
}));

jest.mock("@/stores/tool-builder", () => {
  const state: any = {
    toolType: "backend",
    path: "/users",
    method: "GET",
    name: "get_users",
    description: "Fetch users",
    agentEnabled: true,
    featureMode: "existing",
    featureId: "feature-1",
    featureName: "",
    pathParams: [],
    headers: [],
    queryParams: [],
    bodyFields: [],
    setToolType: jest.fn(),
    setPath: jest.fn(),
    setMethod: jest.fn(),
    setName: jest.fn(),
    setDescription: jest.fn(),
    setAgentEnabled: jest.fn(),
    setFeatureMode: jest.fn(),
    setFeatureId: jest.fn(),
    setFeatureName: jest.fn(),
    setPathParamFixed: jest.fn(),
    setPathParamDescription: jest.fn(),
    setPathParamEnumValues: jest.fn(),
    addFlatField: jest.fn(),
    updateFlatField: jest.fn(),
    removeFlatField: jest.fn(),
    addBodyField: jest.fn(),
    updateBodyField: jest.fn(),
    removeBodyField: jest.fn(),
    reset: jest.fn(),
    hydrate: jest.fn(),
  };
  const hook = (selector: any) => selector(state);
  hook.getState = () => state;
  hook.setState = (partial: any) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    Object.assign(state, next);
  };
  return {
    useToolBuilderStore: hook,
    toolBuilderSelectors: {
      toolType: (s: any) => s.toolType,
      path: (s: any) => s.path,
      method: (s: any) => s.method,
      name: (s: any) => s.name,
      description: (s: any) => s.description,
      agentEnabled: (s: any) => s.agentEnabled,
      featureMode: (s: any) => s.featureMode,
      featureId: (s: any) => s.featureId,
      featureName: (s: any) => s.featureName,
      pathParams: (s: any) => s.pathParams,
      headers: (s: any) => s.headers,
      queryParams: (s: any) => s.queryParams,
      bodyFields: (s: any) => s.bodyFields,
    },
    toolBuilderActions: {
      hydrate: (s: any) => s.hydrate,
      reset: (s: any) => s.reset,
      setToolType: (s: any) => s.setToolType,
      addFlatField: (s: any) => s.addFlatField,
      updateFlatField: (s: any) => s.updateFlatField,
      removeFlatField: (s: any) => s.removeFlatField,
      addBodyField: (s: any) => s.addBodyField,
      updateBodyField: (s: any) => s.updateBodyField,
      removeBodyField: (s: any) => s.removeBodyField,
      setPathParamDescription: (s: any) => s.setPathParamDescription,
      setPathParamEnumValues: (s: any) => s.setPathParamEnumValues,
      setPathParamFixed: (s: any) => s.setPathParamFixed,
      setDescription: (s: any) => s.setDescription,
      setName: (s: any) => s.setName,
      setPath: (s: any) => s.setPath,
      setMethod: (s: any) => s.setMethod,
      setAgentEnabled: (s: any) => s.setAgentEnabled,
      setFeatureMode: (s: any) => s.setFeatureMode,
      setFeatureId: (s: any) => s.setFeatureId,
      setFeatureName: (s: any) => s.setFeatureName,
    },
    toolBuilderUtils: {
      isPrimitiveType: jest.fn(() => true),
      normalizePathInput: jest.fn((value: string) => value),
      extractPathParams: jest.fn(() => []),
    },
  };
});

jest.mock("@/stores/toast", () => {
  const addToast = jest.fn();
  return {
    useToastStore: (selector: any) =>
      selector({ addToast, toasts: [], removeToast: jest.fn() }),
    toastSelectors: { addToast: (state: any) => state.addToast },
  };
});

jest.mock("@/lib/tool-schema", () => ({
  buildToolPayload: jest.fn(() => ({
    toolType: "backend",
    path: "/users",
    method: "GET",
    tool: {
      type: "function",
      function: {
        name: "get_users",
        description: "desc",
        parameters: { type: "object", properties: {} },
      },
    },
    agentEnabled: true,
    feature: { mode: "existing", id: "feature-1" },
  })),
  mapToolToBuilderState: jest.fn(() => ({
    toolType: "backend",
    path: "/users",
    method: "GET",
    name: "get_users",
    description: "desc",
    agentEnabled: true,
    featureMode: "existing",
    featureId: "feature-1",
    featureName: "",
    pathParams: [],
    headers: [],
    queryParams: [],
    bodyFields: [],
  })),
}));

jest.mock("./validation", () => ({
  validateToolState: jest.fn(() => ({
    errors: [],
    invalid: {
      path: false,
      name: false,
      namePattern: false,
      description: false,
      feature: { mode: false, id: false, name: false },
      pathParams: [],
      headers: {},
      queryParams: {},
      bodyFields: {},
    },
  })),
}));

jest.mock("./ToolEditor", () => ({
  ToolEditor: ({ onSave, onClose, editing }: any) => (
    <div>
      <button data-testid="editor-save" onClick={onSave}>
        Save editor
      </button>
      <button data-testid="editor-close" onClick={onClose}>
        Close editor
      </button>
      <span data-testid="editor-editing">{String(editing)}</span>
    </div>
  ),
}));

const mockedUseFeaturesQuery = require("@/queries/use-features")
  .useFeaturesQuery as jest.Mock;
const mockedUseFeatureToolsQuery =
  require("@/queries/use-feature-tools")
    .useFeatureToolsQuery as jest.Mock;
const mockedUseCreateTool = require("@/queries/use-create-tool")
  .useCreateTool as jest.Mock;
const mockedUseUpdateTool = require("@/queries/use-update-tool")
  .useUpdateTool as jest.Mock;
const mockedUseDeleteTool = require("@/queries/use-delete-tool")
  .useDeleteTool as jest.Mock;
const mockedUseCreateFeature = require("@/queries/use-create-feature")
  .useCreateFeature as jest.Mock;
const mockedUseUpdateFeature = require("@/queries/use-update-feature")
  .useUpdateFeature as jest.Mock;
const mockedUseDeleteFeature = require("@/queries/use-delete-feature")
  .useDeleteFeature as jest.Mock;
const mockedUseToggleFeature = require("@/queries/use-toggle-feature")
  .useToggleFeature as jest.Mock;
const validationModule = require("./validation") as {
  validateToolState: jest.Mock;
};

const renderPanel = () =>
  render(
    <TooltipProvider>
      <ToolsPanel />
    </TooltipProvider>,
  );

const basePagination = {
  page: 1,
  pageSize: 5,
  total: 1,
  totalPages: 1,
  hasMore: false,
};

const baseFeatures = [
  {
    id: "feature-1",
    name: "User Management",
    enabledState: "enabled",
    toolCount: 1,
    pagination: basePagination,
    tools: [
      {
        id: "tool-1",
        path: "/users/{id}",
        method: "GET",
        agentEnabled: true,
        tool: {
          type: "function",
          function: {
            name: "get_user",
            description: "Fetch user",
            parameters: { type: "object", properties: {} },
          },
        },
        feature: {
          id: "feature-1",
          name: "User Management",
          enabledState: "enabled",
          toolCount: 1,
        },
      },
    ],
  },
];

describe("ToolsPanel", () => {
  beforeEach(() => {
    validationModule.validateToolState.mockReturnValue({
      errors: [],
      invalid: {
        path: false,
        name: false,
        namePattern: false,
        description: false,
        feature: { mode: false, id: false, name: false },
        pathParams: [],
        headers: {},
        queryParams: {},
        bodyFields: {},
      },
    });
    mockedUseFeaturesQuery.mockReturnValue({
      data: baseFeatures,
      isPending: false,
      isFetching: false,
    });
    mockedUseFeatureToolsQuery.mockReturnValue({
      data: null,
      isFetching: false,
    });
    mockedUseCreateTool.mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
      isPending: false,
    });
    mockedUseUpdateTool.mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
      isPending: false,
    });
    mockedUseDeleteTool.mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
      isPending: false,
    });
    mockedUseCreateFeature.mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
      isPending: false,
    });
    mockedUseUpdateFeature.mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
      isPending: false,
    });
    mockedUseDeleteFeature.mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
      isPending: false,
    });
    mockedUseToggleFeature.mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
      isPending: false,
    });
    useToolsUiStore.setState({
      page: 1,
      pageSize: 5,
      editorOpen: false,
      editingId: null,
      editingTool: null,
      search: "",
      searchDraft: "",
      setPage: toolsUiSelectors.setPage(useToolsUiStore.getState()),
      setPageSize: toolsUiSelectors.setPageSize(
        useToolsUiStore.getState(),
      ),
      setSearch: toolsUiSelectors.setSearch(useToolsUiStore.getState()),
      setSearchDraft: toolsUiSelectors.setSearchDraft(
        useToolsUiStore.getState(),
      ),
      openCreate: toolsUiSelectors.openCreate(
        useToolsUiStore.getState(),
      ),
      openEdit: toolsUiSelectors.openEdit(useToolsUiStore.getState()),
      closeEditor: toolsUiSelectors.closeEditor(
        useToolsUiStore.getState(),
      ),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  it("renders skeletons when loading", () => {
    mockedUseFeaturesQuery.mockReturnValue({
      data: null,
      isPending: true,
      isFetching: false,
    });

    renderPanel();

    expect(screen.getByTestId("tools-loading")).not.toBeNull();
  });

  it("hides feature toggles when no tools exist", () => {
    mockedUseFeaturesQuery.mockReturnValue({
      data: [
        {
          id: "feature-empty",
          name: "Empty",
          enabledState: "disabled",
          toolCount: 0,
          tools: [],
          pagination: {
            page: 1,
            pageSize: 5,
            total: 0,
            totalPages: 1,
            hasMore: false,
          },
        },
      ],
      isPending: false,
      isFetching: false,
    });

    renderPanel();

    expect(screen.queryByLabelText("Enable all tools")).toBeNull();
    expect(screen.queryByLabelText("Disable all tools")).toBeNull();
    expect(screen.queryByText("0 tools")).toBeNull();
  });

  it("shows singular label for one tool", () => {
    mockedUseFeaturesQuery.mockReturnValue({
      data: [
        {
          id: "feature-single",
          name: "Single",
          enabledState: "enabled",
          toolCount: 1,
          pagination: {
            page: 1,
            pageSize: 5,
            total: 1,
            totalPages: 1,
            hasMore: false,
          },
          tools: [
            {
              id: "tool-1",
              path: "/one",
              method: "GET",
              agentEnabled: true,
              tool: {
                type: "function",
                function: {
                  name: "get_one",
                  description: "",
                  parameters: { type: "object", properties: {} },
                },
              },
              feature: {
                id: "feature-single",
                name: "Single",
                enabledState: "enabled",
                toolCount: 1,
              },
            },
          ],
        },
      ],
      isPending: false,
      isFetching: false,
    });

    renderPanel();

    expect(screen.getByText("1 tool")).toBeTruthy();
  });

  it("renders frontend tools and sends frontend payload shape on toggle", async () => {
    const mutateUpdate = jest.fn(async (_payload: any) => undefined);
    mockedUseUpdateTool.mockReturnValue({
      mutateAsync: mutateUpdate,
      isPending: false,
    });
    mockedUseFeaturesQuery.mockReturnValue({
      data: [
        {
          id: "feature-frontend",
          name: "Frontend",
          enabledState: "enabled",
          toolCount: 1,
          pagination: basePagination,
          tools: [
            {
              id: "frontend-tool-1",
              toolType: "frontend",
              agentEnabled: true,
              tool: {
                type: "function",
                function: {
                  name: "open_drawer",
                  description: "Open drawer",
                  parameters: { type: "object", properties: {} },
                },
              },
              feature: {
                id: "feature-frontend",
                name: "Frontend",
                enabledState: "enabled",
                toolCount: 1,
              },
            },
          ],
        },
      ],
      isPending: false,
      isFetching: false,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    expect(screen.getByTestId("feature-name-feature-frontend")).toBeTruthy();
    expect(screen.getByText("window.warpy('open_drawer', vars)")).toBeTruthy();

    await user.click(screen.getByTestId("agent-toggle-frontend-tool-1"));

    await waitFor(() => expect(mutateUpdate).toHaveBeenCalled());
    const payload = mutateUpdate.mock.calls[0][0].payload;
    expect(payload.toolType).toBe("frontend");
    expect("path" in payload).toBe(false);
    expect("method" in payload).toBe(false);
  });

  it("creates and updates tools", async () => {
    const mutateCreate = jest.fn(async (_payload: any) => undefined);
    const mutateUpdate = jest.fn(async (_payload: any) => undefined);
    mockedUseCreateTool.mockReturnValue({
      mutateAsync: mutateCreate,
      isPending: false,
    });
    mockedUseUpdateTool.mockReturnValue({
      mutateAsync: mutateUpdate,
      isPending: false,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    await user.click(screen.getByTestId("new-tool"));
    await user.click(screen.getByTestId("editor-save"));
    expect(mutateCreate).toHaveBeenCalled();

    await user.click(screen.getByTestId("edit-tool-tool-1"));
    await waitFor(() =>
      expect(screen.getByTestId("editor-editing").textContent).toBe("true"),
    );
    await user.click(screen.getByTestId("editor-save"));
    expect(mutateUpdate).toHaveBeenCalled();
  });

  it("keeps editor open when save fails", async () => {
    const mutateCreate = jest.fn(async () => {
      throw new Error("save failed");
    });
    mockedUseCreateTool.mockReturnValue({
      mutateAsync: mutateCreate,
      isPending: false,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    await user.click(screen.getByTestId("new-tool"));
    await user.click(screen.getByTestId("editor-save"));

    await waitFor(() => expect(mutateCreate).toHaveBeenCalled());
    expect(screen.getByTestId("editor-save")).not.toBeNull();
  });

  it("defaults to new feature when no features exist", async () => {
    mockedUseFeaturesQuery.mockReturnValue({
      data: [],
      isPending: false,
      isFetching: false,
    });

    const setFeatureModeMock =
      require("@/stores/tool-builder").useToolBuilderStore.getState()
        .setFeatureMode as jest.Mock;
    setFeatureModeMock.mockClear();

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    await user.click(screen.getByTestId("new-tool"));

    expect(setFeatureModeMock).toHaveBeenCalledWith("new");
  });

  it("deletes features and tools", async () => {
    const mutateDeleteFeature = jest.fn(async (_id: string) => undefined);
    const mutateDeleteTool = jest.fn(async (_id: string) => undefined);
    mockedUseDeleteFeature.mockReturnValue({
      mutateAsync: mutateDeleteFeature,
      isPending: false,
    });
    mockedUseDeleteTool.mockReturnValue({
      mutateAsync: mutateDeleteTool,
      isPending: false,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    const deleteFeatureButton = screen.getByTestId("delete-feature-feature-1");
    expect(deleteFeatureButton.className).toContain("hover:text-destructive");
    await user.click(deleteFeatureButton);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(mutateDeleteFeature).toHaveBeenCalledWith("feature-1");

    const deleteToolButton = screen.getByTestId("delete-tool-tool-1");
    expect(deleteToolButton.className).toContain("hover:text-destructive");
    await user.click(deleteToolButton);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(mutateDeleteTool).toHaveBeenCalledWith("tool-1");
  });

  it("creates a feature from the dialog", async () => {
    const mutateCreateFeature = jest.fn(async (_payload: any) => undefined);
    mockedUseCreateFeature.mockReturnValue({
      mutateAsync: mutateCreateFeature,
      isPending: false,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    await user.click(screen.getByTestId("new-feature"));
    await user.type(await screen.findByLabelText("Feature name"), "Billing");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mutateCreateFeature).toHaveBeenCalledWith({ name: "Billing" });
  });

  it("disables tool toggles while updating", async () => {
    let resolveToggle = () => {};
    const mutateUpdate = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveToggle = resolve;
        }),
    );
    mockedUseUpdateTool.mockReturnValue({
      mutateAsync: mutateUpdate,
      isPending: false,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    const toggle = screen.getByTestId("agent-toggle-tool-1");
    await user.click(toggle);

    await waitFor(() =>
      expect((toggle as HTMLButtonElement).disabled).toBe(true),
    );

    resolveToggle();
    await waitFor(() =>
      expect((toggle as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("disables feature bulk toggles while updating", async () => {
    let resolveFeature = () => {};
    const mutateToggle = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFeature = resolve;
        }),
    );
    mockedUseToggleFeature.mockReturnValue({
      mutateAsync: mutateToggle,
      isPending: false,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    const enableAll = screen.getByLabelText("Enable all tools");
    const disableAll = screen.getByLabelText("Disable all tools");

    await user.click(enableAll);

    await waitFor(() =>
      expect((enableAll as HTMLButtonElement).disabled).toBe(true),
    );
    expect((disableAll as HTMLButtonElement).disabled).toBe(true);

    resolveFeature();
    await waitFor(() =>
      expect((enableAll as HTMLButtonElement).disabled).toBe(false),
    );
    expect((disableAll as HTMLButtonElement).disabled).toBe(false);
  });
});
