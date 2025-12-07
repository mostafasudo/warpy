import { describe, expect, it } from "@jest/globals"

import { buildEndpointPayload, mapEndpointToBuilderState } from "./tool-schema"
import type { EndpointBuilderState, BodyField } from "@/stores/endpoint-builder"
import type { EndpointResponse } from "@/types"

const baseState: EndpointBuilderState = {
  path: "/users/:id",
  method: "GET",
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
  it("builds endpoint payload with params, headers, query, and body", () => {
    const payload = buildEndpointPayload({ ...baseState, bodyFields: complexBody })

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

  it("maps endpoint response to builder state with fixed values", () => {
    const { feature: _feature, ...payload } = buildEndpointPayload({
      ...baseState,
      pathParams: [{ name: "id", fixed: "42" }],
      headers: [{ id: "h1", name: "auth", type: "string", required: false, description: "", fixed: "token" }],
      queryParams: [],
      bodyFields: []
    })

    const state = mapEndpointToBuilderState({
      id: "endpoint-1",
      ...payload,
      feature: {
        id: "feature-1",
        name: "Feature 1",
        enabledState: "enabled",
        endpointCount: 1
      }
    })

    expect(state.path).toBe("/users/:id")
    expect(state.pathParams[0].fixed).toBe("42")
    expect(state.headers[0].fixed).toBe("token")
    expect(state.headers[0].description).toBe("")
  })

  it("normalizes paths and builds nested schemas", () => {
    const payload = buildEndpointPayload({
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

  it("parses endpoint payloads with fixed and nested values", () => {
    const endpoint: EndpointResponse = {
      id: "endpoint-2",
      path: "/users/{id}",
      method: "POST",
      agentEnabled: false,
      feature: {
        id: "feature-2",
        name: "Feature 2",
        enabledState: "enabled",
        endpointCount: 2
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

    const state = mapEndpointToBuilderState(endpoint)

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
    const endpoint: EndpointResponse = {
      id: "endpoint-3",
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
        endpointCount: 4
      }
    }

    const state = mapEndpointToBuilderState(endpoint)
    const payload = buildEndpointPayload(state)

    expect(state.featureMode).toBe("existing")
    expect(state.featureId).toBe("feature-1")
    expect(state.featureName).toBe("Orders")
    expect(payload.feature).toEqual({ mode: "existing", id: "feature-1" })
  })
})
