import { create } from "zustand"

import type { ToolType, HttpMethod } from "@/types"

type PrimitiveType = "string" | "number" | "boolean"
type BodyFieldType = PrimitiveType | "object" | "array:string" | "array:number" | "array:boolean" | "array:object"
type PrimitiveValue = string | number | boolean
type EnumValue = string | number

export type PathParam = {
  name: string
  description?: string
  fixed?: string
  enumValues?: string[]
}

export type FlatField = {
  id: string
  name: string
  type: PrimitiveType
  required: boolean
  description: string
  fixed?: PrimitiveValue
  enumValues?: EnumValue[]
}

export type BodyField = {
  id: string
  name: string
  type: BodyFieldType
  required: boolean
  description: string
  fixed?: PrimitiveValue
  enumValues?: EnumValue[]
  children?: BodyField[]
}

export type ToolBuilderState = {
  toolType: ToolType
  path: string
  method: HttpMethod
  name: string
  description: string
  agentEnabled: boolean
  featureMode: "existing" | "new" | "auto"
  featureId: string | null
  featureName: string
  pathParams: PathParam[]
  headers: FlatField[]
  queryParams: FlatField[]
  bodyFields: BodyField[]
}

type ToolBuilderStore = ToolBuilderState & {
  setToolType: (toolType: ToolType) => void
  setPath: (path: string) => void
  setMethod: (method: HttpMethod) => void
  setName: (name: string) => void
  setDescription: (description: string) => void
  setAgentEnabled: (enabled: boolean) => void
  setFeatureMode: (mode: "existing" | "new" | "auto") => void
  setFeatureId: (id: string | null) => void
  setFeatureName: (name: string) => void
  setPathParamFixed: (name: string, fixed?: string) => void
  setPathParamDescription: (name: string, description: string) => void
  setPathParamEnumValues: (name: string, enumValues?: string[]) => void
  addFlatField: (section: "headers" | "queryParams") => void
  updateFlatField: (section: "headers" | "queryParams", id: string, payload: Partial<FlatField>) => void
  removeFlatField: (section: "headers" | "queryParams", id: string) => void
  addBodyField: (parentId?: string | null, type?: BodyFieldType) => void
  updateBodyField: (id: string, payload: Partial<BodyField>) => void
  removeBodyField: (id: string) => void
  reset: () => void
  hydrate: (state: ToolBuilderState) => void
}

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

const normalizeFieldNameInput = (value: string) => value.replace(/ /g, "_")

const normalizePathParamNames = (path: string) =>
  path
    .replace(/\{([^}]+)\}/g, (_match, name: string) => `:${normalizeFieldNameInput(name)}`)
    .replace(/(^|\/):([^/]+)/g, (_match, prefix: string, name: string) => `${prefix}:${normalizeFieldNameInput(name)}`)

const normalizePathInput = (path: string) => {
  const trimmed = path.trim()
  const safe = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  const normalized = normalizePathParamNames(safe)
  return normalized || "/"
}

const extractPathParams = (path: string) => {
  const matches = Array.from(path.matchAll(/(^|\/):([^/]+)/g))
  return matches.map((match) => match[2])
}

const syncPathParams = (path: string, existing: PathParam[]) => {
  const names = extractPathParams(path)
  return names.map((name) => {
    const current = existing.find((item) => item.name === name)
    return current ?? { name, description: "" }
  })
}

const createFlatField = (): FlatField => ({
  id: createId(),
  name: "",
  type: "string",
  required: false,
  description: ""
})

const canHaveChildren = (type: BodyFieldType) => type === "object" || type === "array:object"
const isPrimitiveType = (type: BodyFieldType): type is PrimitiveType =>
  type === "string" || type === "number" || type === "boolean"
const isEnumSupported = (type: BodyFieldType | PrimitiveType) => type === "string" || type === "number"

const coerceEnumValues = (values: EnumValue[] | undefined, type: PrimitiveType): EnumValue[] | undefined => {
  if (!values) {
    return undefined
  }
  if (!isEnumSupported(type)) {
    return undefined
  }
  const seen = new Set<string>()
  const result: EnumValue[] = []
  values.forEach((value) => {
    if (type === "number") {
      const num = typeof value === "number" ? value : Number(value)
      if (Number.isNaN(num)) {
        return
      }
      const key = String(num)
      if (seen.has(key)) {
        return
      }
      seen.add(key)
      result.push(num)
      return
    }
    const text = typeof value === "string" ? value.trim() : String(value)
    if (!text) {
      return
    }
    if (seen.has(text)) {
      return
    }
    seen.add(text)
    result.push(text)
  })
  return result
}

const createBodyField = (type: BodyFieldType = "string"): BodyField => ({
  id: createId(),
  name: "",
  type,
  required: false,
  description: "",
  children: canHaveChildren(type) ? [] : undefined
})

const mapBodyFields = (
  fields: BodyField[],
  id: string,
  updater: (field: BodyField) => BodyField
): BodyField[] =>
  fields.map((field) => {
    if (field.id === id) {
      return updater(field)
    }
    if (field.children) {
      return { ...field, children: mapBodyFields(field.children, id, updater) }
    }
    return field
  })

const removeBodyFieldById = (fields: BodyField[], id: string): BodyField[] =>
  fields
    .filter((field) => field.id !== id)
    .map((field) =>
      field.children ? { ...field, children: removeBodyFieldById(field.children, id) } : field
    )

const addChildField = (fields: BodyField[], parentId: string | null, field: BodyField): BodyField[] => {
  if (!parentId) {
    return [...fields, field]
  }
  return fields.map((item) => {
    if (item.id === parentId && canHaveChildren(item.type)) {
      const nextChildren = item.children ?? []
      return { ...item, children: [...nextChildren, field] }
    }
    if (item.children) {
      return { ...item, children: addChildField(item.children, parentId, field) }
    }
    return item
  })
}

const defaultState: ToolBuilderState = {
  toolType: "backend",
  path: "/",
  method: "GET",
  name: "",
  description: "",
  agentEnabled: true,
  featureMode: "auto",
  featureId: null,
  featureName: "",
  pathParams: [],
  headers: [],
  queryParams: [],
  bodyFields: []
}

export const useToolBuilderStore = create<ToolBuilderStore>((set) => ({
  ...defaultState,
  setToolType: (toolType) => set({ toolType }),
  setPath: (path) =>
    set((state) => {
      const normalized = normalizePathInput(path)
      return {
        path: normalized,
        pathParams: syncPathParams(normalized, state.pathParams)
      }
    }),
  setMethod: (method) =>
    set((state) => ({
      method,
      bodyFields: method === "GET" ? [] : state.bodyFields
    })),
  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),
  setAgentEnabled: (enabled) => set({ agentEnabled: enabled }),
  setFeatureMode: (mode) =>
    set((state) => ({
      featureMode: mode,
      featureId: mode === "existing" ? state.featureId : null,
      featureName: mode === "new" ? state.featureName : ""
    })),
  setFeatureId: (id) => set((state) => ({ featureId: id, featureName: "", featureMode: id === null ? state.featureMode : "existing" })),
  setFeatureName: (name) =>
    set((state) => ({
      featureId: null,
      featureName: name,
      featureMode: name === "" && state.featureMode === "new" ? "new" : name === "" ? "auto" : "new"
    })),
  setPathParamFixed: (name, fixed) =>
    set((state) => ({
      pathParams: state.pathParams.map((param) =>
        param.name === name ? { ...param, fixed, enumValues: fixed !== undefined ? undefined : param.enumValues } : param
      )
    })),
  setPathParamDescription: (name, description) =>
    set((state) => ({
      pathParams: state.pathParams.map((param) => (param.name === name ? { ...param, description } : param))
    })),
  setPathParamEnumValues: (name, enumValues) =>
    set((state) => ({
      pathParams: state.pathParams.map((param) => {
        if (param.name !== name) {
          return param
        }
        const nextValues =
          enumValues === undefined
            ? undefined
            : (coerceEnumValues(enumValues, "string") as string[] | undefined)
        return {
          ...param,
          fixed: enumValues !== undefined ? undefined : param.fixed,
          enumValues: nextValues
        }
      })
    })),
  addFlatField: (section) =>
    set((state) => ({
      [section]: [...state[section], createFlatField()]
    })),
  updateFlatField: (section, id, payload) =>
    set((state) => ({
      [section]: state[section].map((field) => {
        if (field.id !== id) {
          return field
        }
        const normalizedPayload: Partial<FlatField> = payload.name === undefined
          ? payload
          : { ...payload, name: normalizeFieldNameInput(payload.name) }
        const nextType = normalizedPayload.type ?? field.type
        const updated: FlatField = { ...field, ...normalizedPayload, type: nextType }
        if (normalizedPayload.enumValues !== undefined || normalizedPayload.type !== undefined) {
          updated.enumValues =
            nextType === "boolean"
              ? undefined
              : coerceEnumValues(normalizedPayload.enumValues ?? field.enumValues, nextType)
        }
        if (normalizedPayload.type !== undefined && normalizedPayload.type !== field.type) {
          updated.fixed = undefined
        }
        if (updated.fixed !== undefined) {
          updated.enumValues = undefined
        }
        return updated
      })
    })),
  removeFlatField: (section, id) =>
    set((state) => ({
      [section]: state[section].filter((field) => field.id !== id)
    })),
  addBodyField: (parentId, type = "string") =>
    set((state) => ({
      bodyFields: addChildField(state.bodyFields, parentId ?? null, createBodyField(type))
    })),
  updateBodyField: (id, payload) =>
    set((state) => ({
      bodyFields: mapBodyFields(state.bodyFields, id, (field) => {
        const normalizedPayload: Partial<BodyField> = payload.name === undefined
          ? payload
          : { ...payload, name: normalizeFieldNameInput(payload.name) }
        const nextType = normalizedPayload.type ?? field.type
        const typeChanged = normalizedPayload.type !== undefined && normalizedPayload.type !== field.type
        const base: BodyField = {
          ...field,
          ...normalizedPayload,
          type: nextType
        }
        if (!canHaveChildren(nextType)) {
          base.children = undefined
        } else {
          base.children = base.children ?? []
        }
        if (!isPrimitiveType(nextType) || (typeChanged && normalizedPayload.fixed === undefined)) {
          base.fixed = undefined
        }
        if (normalizedPayload.enumValues !== undefined || typeChanged) {
          base.enumValues = isEnumSupported(nextType)
            ? coerceEnumValues(normalizedPayload.enumValues ?? field.enumValues, nextType as PrimitiveType)
            : undefined
        }
        if (base.fixed !== undefined) {
          base.enumValues = undefined
        }
        return base
      })
    })),
  removeBodyField: (id) =>
    set((state) => ({
      bodyFields: removeBodyFieldById(state.bodyFields, id)
    })),
  reset: () => set(defaultState),
  hydrate: (state) => set(state)
}))

export const toolBuilderSelectors = {
  toolType: (state: ToolBuilderState) => state.toolType,
  path: (state: ToolBuilderState) => state.path,
  method: (state: ToolBuilderState) => state.method,
  name: (state: ToolBuilderState) => state.name,
  description: (state: ToolBuilderState) => state.description,
  agentEnabled: (state: ToolBuilderState) => state.agentEnabled,
  featureMode: (state: ToolBuilderState) => state.featureMode,
  featureId: (state: ToolBuilderState) => state.featureId,
  featureName: (state: ToolBuilderState) => state.featureName,
  pathParams: (state: ToolBuilderState) => state.pathParams,
  headers: (state: ToolBuilderState) => state.headers,
  queryParams: (state: ToolBuilderState) => state.queryParams,
  bodyFields: (state: ToolBuilderState) => state.bodyFields
}

export const toolBuilderActions = {
  setToolType: (state: ToolBuilderStore) => state.setToolType,
  setPath: (state: ToolBuilderStore) => state.setPath,
  setMethod: (state: ToolBuilderStore) => state.setMethod,
  setName: (state: ToolBuilderStore) => state.setName,
  setDescription: (state: ToolBuilderStore) => state.setDescription,
  setAgentEnabled: (state: ToolBuilderStore) => state.setAgentEnabled,
  setFeatureMode: (state: ToolBuilderStore) => state.setFeatureMode,
  setFeatureId: (state: ToolBuilderStore) => state.setFeatureId,
  setFeatureName: (state: ToolBuilderStore) => state.setFeatureName,
  setPathParamFixed: (state: ToolBuilderStore) => state.setPathParamFixed,
  setPathParamDescription: (state: ToolBuilderStore) => state.setPathParamDescription,
  setPathParamEnumValues: (state: ToolBuilderStore) => state.setPathParamEnumValues,
  addFlatField: (state: ToolBuilderStore) => state.addFlatField,
  updateFlatField: (state: ToolBuilderStore) => state.updateFlatField,
  removeFlatField: (state: ToolBuilderStore) => state.removeFlatField,
  addBodyField: (state: ToolBuilderStore) => state.addBodyField,
  updateBodyField: (state: ToolBuilderStore) => state.updateBodyField,
  removeBodyField: (state: ToolBuilderStore) => state.removeBodyField,
  reset: (state: ToolBuilderStore) => state.reset,
  hydrate: (state: ToolBuilderStore) => state.hydrate
}

export const toolBuilderUtils = {
  normalizePathInput,
  extractPathParams,
  normalizeFieldNameInput,
  isPrimitiveType,
  isEnumSupported,
  coerceEnumValues
}
