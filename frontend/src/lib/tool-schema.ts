import { endpointBuilderUtils } from "@/stores/endpoint-builder"
import type {
  BodyField,
  EndpointBuilderState,
  FlatField,
  PathParam
} from "@/stores/endpoint-builder"
import type {
  EndpointPayload,
  EndpointResponse,
  EndpointTool,
  FeatureSelector,
  HttpMethod,
  ToolParameters
} from "@/types"

type PrimitiveType = "string" | "number" | "boolean"
type PrimitiveValue = string | number | boolean

const formatValueDescription = (value: PrimitiveValue) => `pass always as ${value}`
const normalizeDescription = (value: string | undefined, fallback: string) => {
  const text = value?.trim()
  return text ? text : fallback
}

const normalizeToolParameters = (parameters?: ToolParameters): ToolParameters => ({
  type: "object",
  properties: parameters?.properties ?? {},
  required: parameters?.required ?? []
})

const ensureApiPath = (path: string) =>
  endpointBuilderUtils
    .normalizePathInput(path)
    .replace(/:([A-Za-z0-9_-]+)/g, "{$1}")
    .replace(/\/{2,}/g, "/")

const formatPathForDisplay = (path: string) =>
  endpointBuilderUtils.normalizePathInput(path.replace(/\{([^}]+)\}/g, ":$1"))

const getPrimitiveSchema = (type: PrimitiveType, fixed?: PrimitiveValue, name?: string, description?: string) => {
  const schema: Record<string, unknown> = { type }
  if (fixed !== undefined) {
    schema.description = formatValueDescription(fixed)
  } else {
    schema.description = normalizeDescription(description, name || "Value")
  }
  return schema
}

const buildFlatProperties = (fields: FlatField[]) => {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  fields.forEach((field) => {
    const name = field.name.trim()
    if (!name) {
      return
    }
    properties[name] = getPrimitiveSchema(field.type, field.fixed, name, field.description.trim())
    if (field.required) {
      required.push(name)
    }
  })
  if (!Object.keys(properties).length) {
    return null
  }
  return { properties, required }
}

const buildPathParams = (params: PathParam[]) => {
  const properties: Record<string, unknown> = {}
  const required = params
    .map((param) => param.name.trim())
    .filter((name) => Boolean(name))
  params.forEach((param) => {
    const name = param.name.trim()
    if (name) {
      properties[name] = getPrimitiveSchema("string", param.fixed, name, param.description?.trim())
    }
  })
  if (!Object.keys(properties).length) {
    return null
  }
  return { properties, required }
}

const buildBodyFieldSchema = (field: BodyField): Record<string, unknown> => {
  const name = field.name.trim()
  const description = field.description.trim()
  if (endpointBuilderUtils.isPrimitiveType(field.type)) {
    return getPrimitiveSchema(field.type, field.fixed, name, description)
  }
  if (field.type === "object") {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    field.children?.forEach((child) => {
      const childName = child.name.trim()
      if (!childName) {
        return
      }
      properties[childName] = buildBodyFieldSchema(child)
      if (child.required) {
        required.push(childName)
      }
    })
    const schema: Record<string, unknown> = {
      type: "object",
      properties,
      description: normalizeDescription(description, name || "Object")
    }
    if (required.length) {
      schema.required = required
    }
    return schema
  }
  if (field.type.startsWith("array")) {
    const itemType = field.type.split(":")[1] as PrimitiveType | "object"
    if (itemType === "object") {
      const properties: Record<string, unknown> = {}
      const required: string[] = []
      field.children?.forEach((child) => {
        const childName = child.name.trim()
        if (!childName) {
          return
        }
        properties[childName] = buildBodyFieldSchema(child)
        if (child.required) {
          required.push(childName)
        }
      })
      const items: Record<string, unknown> = {
        type: "object",
        properties,
        description: normalizeDescription(description, name ? `${name} item` : "Array item")
      }
      if (required.length) {
        items.required = required
      }
      return {
        type: "array",
        items,
        description: normalizeDescription(description, name ? `${name} array` : "Array")
      }
    }
    return {
      type: "array",
      items: getPrimitiveSchema(itemType, undefined, name ? `${name} item` : "item", description),
      description: normalizeDescription(description, name ? `${name} array` : "Array")
    }
  }
  return { type: "string", description: normalizeDescription(description, name || "Value") }
}

const buildBodySection = (fields: BodyField[]) => {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  fields.forEach((field) => {
    const name = field.name.trim()
    if (!name) {
      return
    }
    properties[name] = buildBodyFieldSchema(field)
    if (field.required) {
      required.push(name)
    }
  })
  if (!Object.keys(properties).length) {
    return null
  }
  const schema: Record<string, unknown> = { type: "object", properties }
  if (required.length) {
    schema.required = required
  }
  return schema
}

export const buildEndpointPayload = (state: EndpointBuilderState): EndpointPayload => {
  const topProperties: Record<string, any> = {}
  const topRequired: string[] = []

  const params = buildPathParams(state.pathParams)
  if (params) {
    const paramsSchema: Record<string, any> = {
      type: "object",
      properties: params.properties,
      description: "Path params of the endpoint"
    }
    if (params.required.length) {
      paramsSchema.required = params.required
    }
    topProperties.params = paramsSchema
    topRequired.push("params")
  }

  const headers = buildFlatProperties(state.headers)
  if (headers) {
    const headerSchema: Record<string, any> = {
      type: "object",
      properties: headers.properties,
      description: "Headers of the endpoint"
    }
    if (headers.required.length) {
      headerSchema.required = headers.required
      topRequired.push("headers")
    }
    topProperties.headers = headerSchema
  }

  const query = buildFlatProperties(state.queryParams)
  if (query) {
    const querySchema: Record<string, any> = {
      type: "object",
      properties: query.properties,
      description: "Query params of the endpoint"
    }
    if (query.required.length) {
      querySchema.required = query.required
      topRequired.push("query")
    }
    topProperties.query = querySchema
  }

  const body = buildBodySection(state.bodyFields)
  if (body) {
    body.description = "Body of the endpoint"
    topProperties.body = body
    const bodyRequired = Array.isArray((body as any).required) ? (body as any).required : []
    if (bodyRequired.length) {
      topRequired.push("body")
    }
  }

  const parameters: ToolParameters = {
    type: "object",
    properties: topProperties,
    required: topRequired.length ? topRequired : []
  }

  const tool: EndpointTool = {
    type: "function",
    function: {
      name: state.name.trim(),
      description: state.description.trim(),
      parameters
    }
  }

  const feature: FeatureSelector = (() => {
    if (state.featureMode === "existing" && state.featureId) {
      return { mode: "existing", id: state.featureId }
    }
    if (state.featureMode === "new" && state.featureName?.trim()) {
      return { mode: "new", name: state.featureName.trim() }
    }
    return { mode: "auto" }
  })()

  return {
    path: ensureApiPath(state.path),
    method: state.method,
    tool,
    agentEnabled: state.agentEnabled,
    feature
  }
}

const parseFixedValue = (description: unknown, type: PrimitiveType): PrimitiveValue | undefined => {
  if (!description || typeof description !== "string") {
    return undefined
  }
  const match = description.match(/^pass always as (.+)$/i)
  if (!match) {
    return undefined
  }
  const raw = match[1]
  if (type === "number") {
    const value = Number(raw)
    return Number.isNaN(value) ? undefined : value
  }
  if (type === "boolean") {
    return raw === "true"
  }
  return raw
}

const parseFlatFields = (schema: any) => {
  const properties = schema?.properties ?? {}
  const required: string[] = schema?.required ?? []
  return Object.entries(properties).map(([name, definition]) => {
    const type = (definition as any)?.type as PrimitiveType | undefined
    const resolvedType: PrimitiveType = type === "number" || type === "boolean" ? type : "string"
    const rawDescription =
      typeof (definition as any)?.description === "string" ? (definition as any).description.trim() : ""
    const fixed = parseFixedValue((definition as any)?.description, resolvedType)
    return {
      id: name,
      name,
      type: resolvedType,
      required: required.includes(name),
      fixed,
      description: fixed === undefined ? rawDescription : ""
    }
  })
}

const parseBodyField = (name: string, schema: any, required: boolean): BodyField => {
  if (!schema || typeof schema !== "object") {
    return {
      id: name,
      name,
      type: "string",
      required,
      description: ""
    }
  }
  if (schema.type === "array") {
    const items = schema.items ?? {}
    const description = typeof schema.description === "string" ? schema.description.trim() : ""
    if (items.type === "object") {
      const childRequired: string[] = items.required ?? []
      const children =
        Object.entries(items.properties ?? {}).map(([childName, childSchema]) =>
          parseBodyField(childName, childSchema, childRequired.includes(childName))
        ) ?? []
      return {
        id: name,
        name,
        type: "array:object",
        required,
        description,
        children
      }
    }
    const primitiveType: PrimitiveType =
      items.type === "number" || items.type === "boolean" ? items.type : "string"
    return {
      id: name,
      name,
      type: `array:${primitiveType}`,
      required,
      description
    }
  }
  if (schema.type === "object") {
    const childRequired: string[] = schema.required ?? []
    const children =
      Object.entries(schema.properties ?? {}).map(([childName, childSchema]) =>
        parseBodyField(childName, childSchema, childRequired.includes(childName))
      ) ?? []
    return {
      id: name,
      name,
      type: "object",
      required,
      description: typeof schema.description === "string" ? schema.description.trim() : "",
      children
    }
  }
  const primitiveType: PrimitiveType =
    schema.type === "number" || schema.type === "boolean" ? schema.type : "string"
  const rawDescription = typeof schema.description === "string" ? schema.description.trim() : ""
  const fixed = parseFixedValue(schema.description, primitiveType)
  return {
    id: name,
    name,
    type: primitiveType,
    required,
    fixed,
    description: fixed === undefined ? rawDescription : ""
  }
}

export const mapEndpointToBuilderState = (endpoint: EndpointResponse): EndpointBuilderState => {
  const parameters = normalizeToolParameters(endpoint.tool?.function?.parameters)
  const path = formatPathForDisplay(endpoint.path)
  const pathNames = endpointBuilderUtils.extractPathParams(path)
  const feature = endpoint.feature as
    | (EndpointResponse["feature"] & Partial<FeatureSelector>)
    | undefined

  const paramsSchema = (parameters.properties as any)?.params
  const paramsProperties = paramsSchema?.properties ?? {}
  const pathParams: PathParam[] = pathNames.map((name) => {
    const definition = paramsProperties[name]
    const rawDescription = typeof definition?.description === "string" ? definition.description.trim() : ""
    const fixed = parseFixedValue(rawDescription, "string")?.toString()
    return {
      name,
      fixed,
      description: fixed === undefined ? rawDescription : ""
    }
  })

  const headersSchema = (parameters.properties as any)?.headers
  const querySchema = (parameters.properties as any)?.query
  const bodySchema = (parameters.properties as any)?.body

  const headers = parseFlatFields(headersSchema ?? {})
  const queryParams = parseFlatFields(querySchema ?? {})

  const bodyRequired: string[] = bodySchema?.required ?? []
  const bodyFields =
    Object.entries(bodySchema?.properties ?? {}).map(([name, schema]) =>
      parseBodyField(name, schema, bodyRequired.includes(name))
    ) ?? []

  const featureMode: EndpointBuilderState["featureMode"] = (() => {
    if (feature?.mode === "existing" || (!feature?.mode && feature?.id)) {
      return "existing"
    }
    if (feature?.mode === "new") {
      return "new"
    }
    return "auto"
  })()

  const state: EndpointBuilderState = {
    path,
    method: endpoint.method as HttpMethod,
    name: endpoint.tool?.function?.name ?? "",
    description: endpoint.tool?.function?.description ?? "",
    agentEnabled: endpoint.agentEnabled ?? true,
    featureMode,
    featureId: feature?.id ?? null,
    featureName: feature?.name ?? "",
    pathParams,
    headers,
    queryParams,
    bodyFields
  }

  return state
}

export { ensureApiPath, formatPathForDisplay }
