import { describe, expect, it } from "@jest/globals"

import type { ToolBuilderState } from "@/stores/tool-builder"
import { validateToolState } from "./validation"

describe("validateToolState", () => {
  it("flags empty names and descriptions", () => {
    const state: ToolBuilderState = {
      toolType: "backend",
      path: "/",
      method: "POST",
      name: "",
      description: "",
      agentEnabled: true,
      featureMode: "auto",
      featureId: null,
      featureName: "",
      pathParams: [{ name: "id", description: "" }],
      headers: [{ id: "header-1", name: "", type: "string", required: false, description: "" }],
      queryParams: [{ id: "query-1", name: "page", type: "number", required: false, description: "" }],
      bodyFields: [
        {
          id: "body-1",
          name: "",
          type: "object",
          required: true,
          description: "",
          children: [
            { id: "child-1", name: "", type: "string", required: false, description: "" }
          ]
        }
      ]
    }

    const result = validateToolState(state)

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Path cannot be empty",
        "Tool name cannot be empty",
        "Tool description cannot be empty",
        "id description cannot be empty",
        "Header 1 name cannot be empty",
        "Header 1 description cannot be empty",
        "page description cannot be empty",
        "field 1 name cannot be empty",
        "field 1 description cannot be empty",
        "field 1.field 1 name cannot be empty",
        "field 1.field 1 description cannot be empty"
      ])
    )
    expect(result.invalid.path).toBe(true)
    expect(result.invalid.name).toBe(true)
    expect(result.invalid.description).toBe(true)
    expect(result.invalid.pathParams[0].description).toBe(true)
    expect(result.invalid.headers["header-1"]).toEqual({ name: true, description: true })
    expect(result.invalid.queryParams["query-1"]).toEqual({ description: true })
    expect(result.invalid.bodyFields["body-1"]).toEqual({ name: true, description: true })
    expect(result.invalid.bodyFields["child-1"]).toEqual({ name: true, description: true })
  })

  it("requires fixed values when enabled and ignores valid booleans", () => {
    const state: ToolBuilderState = {
      toolType: "backend",
      path: "/users/:id",
      method: "POST",
      name: "get_user",
      description: "Fetch user",
      agentEnabled: true,
      featureMode: "auto",
      featureId: null,
      featureName: "",
      pathParams: [{ name: "id", fixed: "" }],
      headers: [{ id: "header-1", name: "auth", type: "string", required: false, description: "", fixed: "" }],
      queryParams: [{ id: "query-1", name: "verbose", type: "boolean", required: false, description: "", fixed: false }],
      bodyFields: [
        { id: "body-1", name: "status", type: "number", required: false, description: "", fixed: Number.NaN },
        { id: "body-2", name: "active", type: "boolean", required: false, description: "", fixed: false }
      ]
    }

    const result = validateToolState(state)

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "id fixed value cannot be empty",
        "auth fixed value cannot be empty",
        "status fixed value cannot be empty"
      ])
    )
    expect(result.invalid.path).toBe(false)
    expect(result.invalid.headers["header-1"]).toEqual({ fixed: true })
    expect(result.invalid.queryParams["query-1"]).toBeUndefined()
    expect(result.invalid.bodyFields["body-1"]).toEqual({ fixed: true })
    expect(result.invalid.bodyFields["body-2"]).toBeUndefined()
  })

  it("requires feature name when creating a new feature", () => {
    const state: ToolBuilderState = {
      toolType: "backend",
      path: "/users",
      method: "POST",
      name: "get_user",
      description: "Fetch",
      agentEnabled: true,
      featureMode: "new",
      featureId: null,
      featureName: "",
      pathParams: [],
      headers: [],
      queryParams: [],
      bodyFields: []
    }

    const result = validateToolState(state)

    expect(result.errors).toContain("Feature name cannot be empty")
    expect(result.invalid.feature.name).toBe(true)
  })

  it("rejects bodies when method is GET", () => {
    const state: ToolBuilderState = {
      toolType: "backend",
      path: "/users",
      method: "GET",
      name: "get_user",
      description: "Fetch",
      agentEnabled: true,
      featureMode: "auto",
      featureId: null,
      featureName: "",
      pathParams: [],
      headers: [],
      queryParams: [],
      bodyFields: [{ id: "b1", name: "payload", type: "object", required: false, description: "desc", children: [] }]
    }

    const result = validateToolState(state)

    expect(result.errors).toContain("GET backend tools cannot include a body")
  })

  it("validates enum selections when enabled", () => {
    const state: ToolBuilderState = {
      toolType: "backend",
      path: "/users/:id",
      method: "POST",
      name: "get_user",
      description: "Fetch",
      agentEnabled: true,
      featureMode: "auto",
      featureId: null,
      featureName: "",
      pathParams: [{ name: "id", description: "User id", enumValues: [] }],
      headers: [
        { id: "header-1", name: "state", type: "string", required: false, description: "States", enumValues: ["open", "open"] }
      ],
      queryParams: [
        { id: "query-1", name: "count", type: "number", required: false, description: "Count", enumValues: [Number.NaN] }
      ],
      bodyFields: [
        { id: "body-1", name: "status", type: "string", required: true, description: "", enumValues: ["open"] }
      ]
    }

    const result = validateToolState(state)

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "id enum requires at least one value",
        "state enum contains invalid or duplicate values",
        "count enum contains invalid or duplicate values"
      ])
    )
    expect(result.invalid.pathParams[0].enum).toBe(true)
    expect(result.invalid.headers["header-1"].enum).toBe(true)
    expect(result.invalid.queryParams["query-1"].enum).toBe(true)
    expect(result.invalid.bodyFields["body-1"].description).toBe(true)
    expect(result.invalid.bodyFields["body-1"].enum).toBeUndefined()
  })

  it("validates frontend tool parameter fields", () => {
    const state: ToolBuilderState = {
      toolType: "frontend",
      path: "/",
      method: "POST",
      name: "open_drawer",
      description: "Open drawer",
      agentEnabled: true,
      featureMode: "auto",
      featureId: null,
      featureName: "",
      pathParams: [],
      headers: [],
      queryParams: [],
      bodyFields: [{ id: "p1", name: "", type: "string", required: true, description: "" }]
    }

    const result = validateToolState(state)

    expect(result.errors).toContain("field 1 name cannot be empty")
    expect(result.errors).toContain("field 1 description cannot be empty")
    expect(result.invalid.bodyFields["p1"]).toEqual({ name: true, description: true })
  })

  it("rejects reserved tool names", () => {
    const state: ToolBuilderState = {
      toolType: "frontend",
      path: "/",
      method: "POST",
      name: "frontend",
      description: "desc",
      agentEnabled: true,
      featureMode: "auto",
      featureId: null,
      featureName: "",
      pathParams: [],
      headers: [],
      queryParams: [],
      bodyFields: []
    }

    const result = validateToolState(state)

    expect(result.errors).toContain("Tool name is reserved. Choose a different name.")
    expect(result.invalid.name).toBe(true)
  })

  it("enforces variable/input naming pattern across backend and frontend fields", () => {
    const backendState: ToolBuilderState = {
      toolType: "backend",
      path: "/users/:id",
      method: "POST",
      name: "get_user",
      description: "Fetch",
      agentEnabled: true,
      featureMode: "auto",
      featureId: null,
      featureName: "",
      pathParams: [{ name: "user id", description: "User id" }],
      headers: [{ id: "header-1", name: "x api", type: "string", required: false, description: "Header" }],
      queryParams: [{ id: "query-1", name: "page.size", type: "number", required: false, description: "Count" }],
      bodyFields: [
        {
          id: "body-1",
          name: "line item",
          type: "object",
          required: false,
          description: "Body",
          children: [{ id: "child-1", name: "note field", type: "string", required: false, description: "Note" }]
        }
      ]
    }

    const backendResult = validateToolState(backendState)

    expect(backendResult.errors).toEqual(
      expect.arrayContaining([
        "user id name must use letters, numbers, underscores, or dashes (max 64)",
        "x api name must use letters, numbers, underscores, or dashes (max 64)",
        "page.size name must use letters, numbers, underscores, or dashes (max 64)",
        "line item name must use letters, numbers, underscores, or dashes (max 64)",
        "line item.note field name must use letters, numbers, underscores, or dashes (max 64)"
      ])
    )
    expect(backendResult.invalid.pathParams[0].name).toBe(true)
    expect(backendResult.invalid.headers["header-1"].name).toBe(true)
    expect(backendResult.invalid.queryParams["query-1"].name).toBe(true)
    expect(backendResult.invalid.bodyFields["body-1"]?.name).toBe(true)
    expect(backendResult.invalid.bodyFields["child-1"]?.name).toBe(true)

    const frontendState: ToolBuilderState = {
      toolType: "frontend",
      path: "/",
      method: "POST",
      name: "open_drawer",
      description: "Open drawer",
      agentEnabled: true,
      featureMode: "auto",
      featureId: null,
      featureName: "",
      pathParams: [],
      headers: [],
      queryParams: [],
      bodyFields: [{ id: "param-1", name: "drawer state", type: "string", required: true, description: "state" }]
    }

    const frontendResult = validateToolState(frontendState)

    expect(frontendResult.errors).toContain(
      "drawer state name must use letters, numbers, underscores, or dashes (max 64)"
    )
    expect(frontendResult.invalid.bodyFields["param-1"]?.name).toBe(true)
  })
})
