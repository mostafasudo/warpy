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
import { FeaturesPanel } from "./EndpointsPanel";
import {
  endpointsUiSelectors,
  useEndpointsUiStore,
} from "@/stores/endpoints-ui";

jest.mock("@/queries/use-features", () => ({
  useFeaturesQuery: jest.fn(),
}));

jest.mock("@/queries/use-feature-endpoints", () => ({
  useFeatureEndpointsQuery: jest.fn(),
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

jest.mock("@/queries/use-delete-endpoint", () => ({
  useDeleteEndpoint: jest.fn(),
}));

jest.mock("@/queries/use-create-endpoint", () => ({
  useCreateEndpoint: jest.fn(),
}));

jest.mock("@/queries/use-update-endpoint", () => ({
  useUpdateEndpoint: jest.fn(),
}));

jest.mock("@/stores/endpoint-builder", () => {
  const state: any = {
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
    useEndpointBuilderStore: hook,
    endpointBuilderSelectors: {
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
    endpointBuilderActions: {
      hydrate: (s: any) => s.hydrate,
      reset: (s: any) => s.reset,
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
    endpointBuilderUtils: {
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
  buildEndpointPayload: jest.fn(() => ({
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
  mapEndpointToBuilderState: jest.fn(() => ({
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
  validateEndpointState: jest.fn(() => ({
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

jest.mock("./EndpointEditor", () => ({
  EndpointEditor: ({ onSave, onClose, editing }: any) => (
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
const mockedUseFeatureEndpointsQuery =
  require("@/queries/use-feature-endpoints")
    .useFeatureEndpointsQuery as jest.Mock;
const mockedUseCreateEndpoint = require("@/queries/use-create-endpoint")
  .useCreateEndpoint as jest.Mock;
const mockedUseUpdateEndpoint = require("@/queries/use-update-endpoint")
  .useUpdateEndpoint as jest.Mock;
const mockedUseDeleteEndpoint = require("@/queries/use-delete-endpoint")
  .useDeleteEndpoint as jest.Mock;
const mockedUseCreateFeature = require("@/queries/use-create-feature")
  .useCreateFeature as jest.Mock;
const mockedUseUpdateFeature = require("@/queries/use-update-feature")
  .useUpdateFeature as jest.Mock;
const mockedUseDeleteFeature = require("@/queries/use-delete-feature")
  .useDeleteFeature as jest.Mock;
const mockedUseToggleFeature = require("@/queries/use-toggle-feature")
  .useToggleFeature as jest.Mock;
const validationModule = require("./validation") as {
  validateEndpointState: jest.Mock;
};

const renderPanel = () =>
  render(
    <TooltipProvider>
      <FeaturesPanel />
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
    endpointCount: 1,
    pagination: basePagination,
    endpoints: [
      {
        id: "endpoint-1",
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
          endpointCount: 1,
        },
      },
    ],
  },
];

describe("FeaturesPanel", () => {
  beforeEach(() => {
    validationModule.validateEndpointState.mockReturnValue({
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
    mockedUseFeatureEndpointsQuery.mockReturnValue({
      data: null,
      isFetching: false,
    });
    mockedUseCreateEndpoint.mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
      isPending: false,
    });
    mockedUseUpdateEndpoint.mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
      isPending: false,
    });
    mockedUseDeleteEndpoint.mockReturnValue({
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
    useEndpointsUiStore.setState({
      page: 1,
      pageSize: 5,
      editorOpen: false,
      editingId: null,
      editingEndpoint: null,
      search: "",
      searchDraft: "",
      setPage: endpointsUiSelectors.setPage(useEndpointsUiStore.getState()),
      setPageSize: endpointsUiSelectors.setPageSize(
        useEndpointsUiStore.getState(),
      ),
      setSearch: endpointsUiSelectors.setSearch(useEndpointsUiStore.getState()),
      setSearchDraft: endpointsUiSelectors.setSearchDraft(
        useEndpointsUiStore.getState(),
      ),
      openCreate: endpointsUiSelectors.openCreate(
        useEndpointsUiStore.getState(),
      ),
      openEdit: endpointsUiSelectors.openEdit(useEndpointsUiStore.getState()),
      closeEditor: endpointsUiSelectors.closeEditor(
        useEndpointsUiStore.getState(),
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

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
  });

  it("hides feature toggles when no endpoints exist", () => {
    mockedUseFeaturesQuery.mockReturnValue({
      data: [
        {
          id: "feature-empty",
          name: "Empty",
          enabledState: "disabled",
          endpointCount: 0,
          endpoints: [],
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

    expect(screen.queryByLabelText("Enable all endpoints")).toBeNull();
    expect(screen.queryByLabelText("Disable all endpoints")).toBeNull();
    expect(screen.queryByText("0 endpoints")).toBeNull();
  });

  it("shows singular label for one endpoint", () => {
    mockedUseFeaturesQuery.mockReturnValue({
      data: [
        {
          id: "feature-single",
          name: "Single",
          enabledState: "enabled",
          endpointCount: 1,
          pagination: {
            page: 1,
            pageSize: 5,
            total: 1,
            totalPages: 1,
            hasMore: false,
          },
          endpoints: [
            {
              id: "endpoint-1",
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
                endpointCount: 1,
              },
            },
          ],
        },
      ],
      isPending: false,
      isFetching: false,
    });

    renderPanel();

    expect(screen.getByText("1 endpoint")).toBeTruthy();
  });

  it("creates and updates endpoints", async () => {
    const mutateCreate = jest.fn(async (_payload: any) => undefined);
    const mutateUpdate = jest.fn(async (_payload: any) => undefined);
    mockedUseCreateEndpoint.mockReturnValue({
      mutateAsync: mutateCreate,
      isPending: false,
    });
    mockedUseUpdateEndpoint.mockReturnValue({
      mutateAsync: mutateUpdate,
      isPending: false,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    await user.click(screen.getByTestId("new-endpoint"));
    await user.click(screen.getByTestId("editor-save"));
    expect(mutateCreate).toHaveBeenCalled();

    await user.click(screen.getByTestId("edit-endpoint-endpoint-1"));
    await waitFor(() =>
      expect(screen.getByTestId("editor-editing").textContent).toBe("true"),
    );
    await user.click(screen.getByTestId("editor-save"));
    expect(mutateUpdate).toHaveBeenCalled();
  });

  it("defaults to new feature when no features exist", async () => {
    mockedUseFeaturesQuery.mockReturnValue({
      data: [],
      isPending: false,
      isFetching: false,
    });

    const setFeatureModeMock =
      require("@/stores/endpoint-builder").useEndpointBuilderStore.getState()
        .setFeatureMode as jest.Mock;
    setFeatureModeMock.mockClear();

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    await user.click(screen.getByTestId("new-endpoint"));

    expect(setFeatureModeMock).toHaveBeenCalledWith("new");
  });

  it("deletes features and endpoints", async () => {
    const mutateDeleteFeature = jest.fn(async (_id: string) => undefined);
    const mutateDeleteEndpoint = jest.fn(async (_id: string) => undefined);
    mockedUseDeleteFeature.mockReturnValue({
      mutateAsync: mutateDeleteFeature,
      isPending: false,
    });
    mockedUseDeleteEndpoint.mockReturnValue({
      mutateAsync: mutateDeleteEndpoint,
      isPending: false,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    await user.click(screen.getByTestId("delete-feature-feature-1"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(mutateDeleteFeature).toHaveBeenCalledWith("feature-1");

    await user.click(screen.getByTestId("delete-endpoint-endpoint-1"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(mutateDeleteEndpoint).toHaveBeenCalledWith("endpoint-1");
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

  it("disables endpoint toggles while updating", async () => {
    let resolveToggle = () => {};
    const mutateUpdate = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveToggle = resolve;
        }),
    );
    mockedUseUpdateEndpoint.mockReturnValue({
      mutateAsync: mutateUpdate,
      isPending: false,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    const toggle = screen.getByTestId("agent-toggle-endpoint-1");
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

    const enableAll = screen.getByLabelText("Enable all endpoints");
    const disableAll = screen.getByLabelText("Disable all endpoints");

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
