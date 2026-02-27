import { describe, expect, it } from "@jest/globals"

import { buildToolPayload, mapToolToBuilderState } from "./tool-schema"
import type { ToolBuilderState, BodyField } from "@/stores/tool-builder"
import type { ToolResponse } from "@/types"

const baseState: ToolBuilderState = {
  toolType: "backend",
  path: "/users/:id",
  method: "POST",
  name: "get_user",
  description: "Fetch user",
  agentEnabled: true,
  featureMode: "auto",
  featureId: null,
  featureName: "",
  pathParams: [{ name: "id", description: "User id" }],
  headers: [{ id: "h1", name: "auth", type: "string", required: true, description: "Auth token" }],
  queryParams: [{ id: "q1", name: "verbose", type: "boolean", required: false, description: "Verbose flag" }],
  bodyFields: []
}

const complexBody: BodyField[] = [
  {
    id: "payload",
    name: "payload",
    type: "object",
    required: true,
    description: "Request body",
    children: [
      { id: "title", name: "title", type: "string", required: true, description: "Title" },
      {
        id: "items",
        name: "items",
        type: "array:object",
        required: false,
        description: "Items",
        children: [{ id: "sku", name: "sku", type: "string", required: true, description: "Sku" }]
      }
    ]
  }
]

describe("tool-schema", () => {
  it("builds backend tool payload with params, headers, query, and body", () => {
    const payload = buildToolPayload({ ...baseState, bodyFields: complexBody })

    expect(payload.path).toBe("/users/{id}")
    expect(payload.tool.function.name).toBe("get_user")
    const parameters = payload.tool.function.parameters as any
    expect(parameters.properties.params.properties.id.description).toBe("User id")
    expect(parameters.properties.headers.properties.auth.type).toBe("string")
    expect(parameters.properties.query.properties.verbose.type).toBe("boolean")
    expect(parameters.properties.body.properties.payload.properties.title.description).toBe("Title")
    expect(parameters.properties.body.properties.payload.properties.items.type).toBe("array")
    expect(parameters.required).toContain("params")
  })

  it("maps tool response to builder state with fixed values", () => {
    const { feature: _feature, ...payload } = buildToolPayload({
      ...baseState,
      pathParams: [{ name: "id", fixed: "42" }],
      headers: [{ id: "h1", name: "auth", type: "string", required: false, description: "", fixed: "token" }],
      queryParams: [],
      bodyFields: []
    })

    const state = mapToolToBuilderState({
      id: "tool-1",
      ...payload,
      feature: {
        id: "feature-1",
        name: "Feature 1",
        enabledState: "enabled",
        toolCount: 1
      }
    })

    expect(state.path).toBe("/users/:id")
    expect(state.pathParams[0].fixed).toBe("42")
    expect(state.headers[0].fixed).toBe("token")
    expect(state.headers[0].description).toBe("")
  })

  it("preserves enum values across build and parse", () => {
    const { feature: _feature, ...payload } = buildToolPayload({
      ...baseState,
      pathParams: [{ name: "id", description: "User id", enumValues: ["one", "two"] }],
      headers: [
        { id: "h1", name: "status", type: "string", required: false, description: "", enumValues: ["open", "closed"] }
      ],
      queryParams: [{ id: "q1", name: "limit", type: "number", required: false, description: "Limit", enumValues: [1, 2] }],
      bodyFields: [
        { id: "b1", name: "status", type: "string", required: true, description: "", enumValues: ["open", "closed"] },
        { id: "b2", name: "score", type: "number", required: false, description: "", enumValues: [1, 2] }
      ]
    })

    const parameters = payload.tool.function.parameters as any
    expect(parameters.properties.params.properties.id.enum).toEqual(["one", "two"])
    expect(parameters.properties.headers.properties.status.enum).toEqual(["open", "closed"])
    expect(parameters.properties.query.properties.limit.enum).toEqual([1, 2])
    expect(parameters.properties.body.properties.status.enum).toEqual(["open", "closed"])
    expect(parameters.properties.body.properties.score.enum).toEqual([1, 2])

    const state = mapToolToBuilderState({
      id: "tool-enum",
      ...payload,
      feature: {
        id: "feature-1",
        name: "Feature",
        enabledState: "enabled",
        toolCount: 1
      }
    })

    expect(state.pathParams[0].enumValues).toEqual(["one", "two"])
    expect(state.headers[0].enumValues).toEqual(["open", "closed"])
    expect(state.queryParams[0].enumValues).toEqual([1, 2])
    expect(state.bodyFields.find((f) => f.name === "status")?.enumValues).toEqual(["open", "closed"])
    expect(state.bodyFields.find((f) => f.name === "score")?.enumValues).toEqual([1, 2])
  })

  it("normalizes paths and builds nested schemas", () => {
    const payload = buildToolPayload({
      ...baseState,
      path: "users//{id}//",
      description: "  ",
      headers: [
        { id: "h1", name: "x", type: "string", required: true, description: "X" },
        { id: "h2", name: " ", type: "string", required: false, description: "skip" }
      ],
      queryParams: [{ id: "q1", name: "limit", type: "number", required: true, description: " Limit " }],
      bodyFields: [
        { id: "ignored", name: " ", type: "string", required: false, description: "" },
        {
          id: "arr",
          name: "items",
          type: "array:number",
          required: false,
          description: " Items "
        },
        {
          id: "obj",
          name: "payload",
          type: "object",
          required: true,
          description: " Payload ",
          children: [
            { id: "title", name: "title", type: "string", required: true, description: " Title " },
            {
              id: "detail",
              name: "detail",
              type: "array:object",
              required: false,
              description: " Detail ",
              children: [{ id: "age", name: "age", type: "number", required: false, description: " Age " }]
            }
          ]
        }
      ]
    })

    expect(payload.path).toBe("/users/{id}/")
    const parameters = payload.tool.function.parameters as any
    expect(parameters.properties.headers.required).toContain("x")
    expect(parameters.properties.query.properties.limit.description).toBe("Limit")
    expect(parameters.properties.body.properties.payload.properties.title.description).toBe("Title")
    expect(parameters.properties.body.properties.payload.properties.detail.items.type).toBe("object")
    expect(parameters.properties.body.properties.items.description).toBe("Items")
    expect(parameters.required).toContain("params")
    expect(parameters.required).toContain("body")
    expect(payload.agentEnabled).toBe(true)
  })

  it("parses tool payloads with fixed and nested values", () => {
    const tool: ToolResponse = {
      id: "tool-2",
      path: "/users/{id}",
      method: "POST",
      agentEnabled: false,
      feature: {
        id: "feature-2",
        name: "Feature 2",
        enabledState: "enabled",
        toolCount: 2
      },
      tool: {
        type: "function",
        function: {
          name: "create_user",
          description: "Create user",
          parameters: {
            type: "object",
            required: ["params", "body"],
            properties: {
              params: {
                type: "object",
                required: ["id"],
                properties: { id: { type: "string", description: "pass always as 9" } }
              },
              headers: {
                type: "object",
                properties: { auth: { type: "string", description: "pass always as secret" } }
              },
              query: {
                type: "object",
                required: ["limit"],
                properties: {
                  limit: { type: "number", description: "pass always as 3" },
                  verbose: { type: "boolean", description: "pass always as true" }
                }
              },
              body: {
                type: "object",
                required: ["profile"],
                properties: {
                  profile: {
                    type: "object",
                    required: ["age"],
                    description: " Profile ",
                    properties: {
                      age: { type: "number", description: "pass always as 30" },
                      tag: { type: "string", description: "Tag" }
                    }
                  },
                  items: {
                    type: "array",
                    description: " Items ",
                    items: {
                      type: "object",
                      required: ["id"],
                      properties: {
                        id: { type: "string", description: "Identifier" },
                        active: { type: "boolean", description: "pass always as false" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    const state = mapToolToBuilderState(tool)

    expect(state.path).toBe("/users/:id")
    expect(state.agentEnabled).toBe(false)
    expect(state.pathParams[0].fixed).toBe("9")
    expect(state.headers[0].fixed).toBe("secret")
    expect(state.queryParams.find((q) => q.name === "limit")?.fixed).toBe(3)
    expect(state.queryParams.find((q) => q.name === "verbose")?.fixed).toBe(true)
    const profile = state.bodyFields.find((f) => f.name === "profile")
    expect(profile?.children?.find((child) => child.name === "age")?.fixed).toBe(30)
    const items = state.bodyFields.find((f) => f.name === "items")
    expect(items?.type).toBe("array:object")
    expect(items?.children?.find((child) => child.name === "active")?.fixed).toBe(false)
  })

  it("keeps existing feature selection when backend omits mode", () => {
    const tool: ToolResponse = {
      id: "tool-3",
      path: "/orders/{id}",
      method: "GET",
      agentEnabled: true,
      tool: {
        type: "function",
        function: {
          name: "get_order",
          description: "",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      feature: {
        id: "feature-1",
        name: "Orders",
        enabledState: "enabled",
        toolCount: 4
      }
    }

    const state = mapToolToBuilderState(tool)
    const payload = buildToolPayload(state)

    expect(state.featureMode).toBe("existing")
    expect(state.featureId).toBe("feature-1")
    expect(state.featureName).toBe("Orders")
    expect(payload.feature).toEqual({ mode: "existing", id: "feature-1" })
  })

  it("omits body when method is GET", () => {
    const payload = buildToolPayload({ ...baseState, method: "GET", bodyFields: complexBody })
    const parameters = payload.tool.function.parameters as any
    expect(parameters.properties.body).toBeUndefined()
  })

  it("builds frontend payload from structured parameter fields", () => {
    const payload = buildToolPayload({
      ...baseState,
      toolType: "frontend",
      name: "open_drawer",
      description: "Open order drawer",
      bodyFields: [
        { id: "order-id", name: "orderId", type: "string", required: true, description: "Order id" },
        { id: "new-tab", name: "openInNewTab", type: "boolean", required: false, description: "Open in new tab" }
      ]
    })

    expect(payload.toolType).toBe("frontend")
    expect(payload.path).toBeUndefined()
    expect(payload.method).toBeUndefined()
    expect((payload.tool.function.parameters as any).properties.orderId.type).toBe("string")
    expect((payload.tool.function.parameters as any).properties.openInNewTab.type).toBe("boolean")
    expect((payload.tool.function.parameters as any).required).toEqual(["orderId"])
  })

  it("maps frontend tool payloads to frontend builder state", () => {
    const state = mapToolToBuilderState({
      id: "tool-frontend",
      toolType: "frontend",
      path: null,
      method: null,
      agentEnabled: true,
      feature: {
        id: "feature-1",
        name: "Orders",
        enabledState: "enabled",
        toolCount: 1
      },
      tool: {
        type: "function",
        function: {
          name: "open_drawer",
          description: "Open drawer",
          parameters: {
            type: "object",
            properties: {
              orderId: { type: "string" },
              openInNewTab: { type: "boolean" }
            },
            required: ["orderId", "openInNewTab"]
          }
        }
      }
    })

    expect(state.toolType).toBe("frontend")
    expect(state.pathParams).toEqual([])
    expect(state.headers).toEqual([])
    expect(state.queryParams).toEqual([])
    expect(state.bodyFields).toHaveLength(2)
    expect(state.bodyFields.find((field) => field.name === "orderId")?.type).toBe("string")
    expect(state.bodyFields.find((field) => field.name === "orderId")?.required).toBe(true)
    expect(state.bodyFields.find((field) => field.name === "openInNewTab")?.type).toBe("boolean")
    expect(state.bodyFields.find((field) => field.name === "openInNewTab")?.required).toBe(true)
  })
})
