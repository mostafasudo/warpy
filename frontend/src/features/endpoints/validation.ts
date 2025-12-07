import type { BodyField, EndpointBuilderState, FlatField } from "@/stores/endpoint-builder"
import { endpointBuilderUtils } from "@/stores/endpoint-builder"
import { endpointNamePattern } from "./constants"

export type FieldValidation = {
  name?: boolean
  description?: boolean
  fixed?: boolean
}

type PathParamValidation = {
  description?: boolean
  fixed?: boolean
}

export type EndpointValidationResult = {
  errors: string[]
  invalid: {
    path: boolean
    name: boolean
    namePattern: boolean
    description: boolean
    feature: {
      mode: boolean
      id: boolean
      name: boolean
    }
    pathParams: PathParamValidation[]
    headers: Record<string, FieldValidation>
    queryParams: Record<string, FieldValidation>
    bodyFields: Record<string, FieldValidation>
  }
}

const isTextEmpty = (value?: string) => !value?.trim()

const isPrimitiveFixedMissing = (
  value: FlatField["fixed"] | BodyField["fixed"],
  type: "string" | "number" | "boolean"
) => {
  if (value === undefined) {
    return true
  }
  if (type === "string") {
    return typeof value !== "string" || !value.trim()
  }
  if (type === "number") {
    if (typeof value === "number") {
      return Number.isNaN(value)
    }
    return true
  }
  return false
}

const validateFlatFields = (fields: FlatField[], label: "Header" | "Query param") => {
  const issues: Record<string, FieldValidation> = {}
  const errors: string[] = []

  fields.forEach((field, index) => {
    const entry: FieldValidation = {}
    const trimmedName = field.name.trim()
    const displayName = trimmedName || `${label} ${index + 1}`

    if (!trimmedName) {
      errors.push(`${label} ${index + 1} name cannot be empty`)
      entry.name = true
    }

    const fixedEnabled = field.fixed !== undefined
    if (fixedEnabled) {
      if (isPrimitiveFixedMissing(field.fixed, field.type)) {
        errors.push(`${displayName} fixed value cannot be empty`)
        entry.fixed = true
      }
    } else if (isTextEmpty(field.description)) {
      errors.push(`${displayName} description cannot be empty`)
      entry.description = true
    }

    if (entry.name || entry.description || entry.fixed) {
      issues[field.id] = entry
    }
  })

  return { issues, errors }
}

const validateBodyFields = (
  fields: BodyField[],
  trail: string[],
  invalid: Record<string, FieldValidation>,
  errors: string[]
) => {
  fields.forEach((field, index) => {
    const trimmedName = field.name.trim()
    const fallbackName = trimmedName || `field ${index + 1}`
    const currentTrail = [...trail, fallbackName].filter(Boolean)
    const label = currentTrail.join(".") || "Body field"
    const entry: FieldValidation = {}

    if (!trimmedName) {
      errors.push(`${label} name cannot be empty`)
      entry.name = true
    }

    if (endpointBuilderUtils.isPrimitiveType(field.type)) {
      const fixedEnabled = field.fixed !== undefined
      if (fixedEnabled) {
        if (isPrimitiveFixedMissing(field.fixed, field.type)) {
          errors.push(`${label} fixed value cannot be empty`)
          entry.fixed = true
        }
      } else if (isTextEmpty(field.description)) {
        errors.push(`${label} description cannot be empty`)
        entry.description = true
      }
    } else if (isTextEmpty(field.description)) {
      errors.push(`${label} description cannot be empty`)
      entry.description = true
    }

    if (entry.name || entry.description || entry.fixed) {
      invalid[field.id] = entry
    }

    if (field.children?.length) {
      validateBodyFields(field.children, currentTrail, invalid, errors)
    }
  })
}

export const validateEndpointState = (state: EndpointBuilderState): EndpointValidationResult => {
  const errors: string[] = []
  const pathParams: PathParamValidation[] = state.pathParams.map(() => ({}))

  const invalid: EndpointValidationResult["invalid"] = {
    path: false,
    name: false,
    namePattern: false,
    description: false,
    feature: { mode: false, id: false, name: false },
    pathParams,
    headers: {},
    queryParams: {},
    bodyFields: {}
  }

  if (!state.path.replace(/\//g, "").trim()) {
    errors.push("Path cannot be empty")
    invalid.path = true
  }

  const trimmedName = state.name?.trim()
  if (!trimmedName) {
    errors.push("Endpoint name cannot be empty")
    invalid.name = true
  } else if (!endpointNamePattern.test(trimmedName)) {
    errors.push("Endpoint name must use letters, numbers, underscores, or dashes")
    invalid.name = true
    invalid.namePattern = true
  }

  if (!state.description?.trim()) {
    errors.push("Endpoint description cannot be empty")
    invalid.description = true
  }

  if (state.featureMode === "existing" && !state.featureId) {
    errors.push("Select a feature")
    invalid.feature.id = true
  } else if (state.featureMode === "new") {
    if (!state.featureName?.trim()) {
      errors.push("Feature name cannot be empty")
      invalid.feature.name = true
    }
  }

  state.pathParams.forEach((param, index) => {
    const trimmedName = param.name.trim()
    const label = trimmedName || `Path parameter ${index + 1}`
    const entry = invalid.pathParams[index]
    const fixedEnabled = param.fixed !== undefined

    if (fixedEnabled) {
      if (!param.fixed?.toString().trim()) {
        errors.push(`${label} fixed value cannot be empty`)
        entry.fixed = true
      }
    } else if (isTextEmpty(param.description)) {
      errors.push(`${label} description cannot be empty`)
      entry.description = true
    }
  })

  const headerResult = validateFlatFields(state.headers, "Header")
  const queryResult = validateFlatFields(state.queryParams, "Query param")
  headerResult.errors.forEach((error) => errors.push(error))
  queryResult.errors.forEach((error) => errors.push(error))
  invalid.headers = headerResult.issues
  invalid.queryParams = queryResult.issues

  validateBodyFields(state.bodyFields, [], invalid.bodyFields, errors)

  return { errors, invalid }
}
