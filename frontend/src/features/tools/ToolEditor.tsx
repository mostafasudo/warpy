import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Copy, Plus } from "lucide-react"

import { ActionTooltip } from "@/components/action-tooltip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  toolBuilderActions,
  toolBuilderSelectors,
  useToolBuilderStore
} from "@/stores/tool-builder"
import { type FeatureSummary, type HttpMethod } from "@/types"
import { EnumValuesInput } from "./EnumValuesInput"
import { BodyFieldRow } from "./BodyFieldRow"
import { FlatFieldList } from "./FlatFieldList"
import { validateToolState } from "./validation"

type ToolEditorProps = {
  editing: boolean
  isSaving: boolean
  onSave: () => void
  onClose: () => void
  features: FeatureSummary[]
}

export const ToolEditor = ({ editing, isSaving, onSave, onClose, features }: ToolEditorProps) => {
  const toolType = useToolBuilderStore(toolBuilderSelectors.toolType)
  const path = useToolBuilderStore(toolBuilderSelectors.path)
  const method = useToolBuilderStore(toolBuilderSelectors.method)
  const name = useToolBuilderStore(toolBuilderSelectors.name)
  const description = useToolBuilderStore(toolBuilderSelectors.description)
  const agentEnabled = useToolBuilderStore(toolBuilderSelectors.agentEnabled)
  const featureMode = useToolBuilderStore(toolBuilderSelectors.featureMode)
  const featureId = useToolBuilderStore(toolBuilderSelectors.featureId)
  const featureName = useToolBuilderStore(toolBuilderSelectors.featureName)
  const pathParams = useToolBuilderStore(toolBuilderSelectors.pathParams)
  const headers = useToolBuilderStore(toolBuilderSelectors.headers)
  const queryParams = useToolBuilderStore(toolBuilderSelectors.queryParams)
  const bodyFields = useToolBuilderStore(toolBuilderSelectors.bodyFields)
  const setToolType = useToolBuilderStore(toolBuilderActions.setToolType)
  const setPath = useToolBuilderStore(toolBuilderActions.setPath)
  const setMethod = useToolBuilderStore(toolBuilderActions.setMethod)
  const setName = useToolBuilderStore(toolBuilderActions.setName)
  const setDescription = useToolBuilderStore(toolBuilderActions.setDescription)
  const setAgentEnabled = useToolBuilderStore(toolBuilderActions.setAgentEnabled)
  const setFeatureMode = useToolBuilderStore(toolBuilderActions.setFeatureMode)
  const setFeatureId = useToolBuilderStore(toolBuilderActions.setFeatureId)
  const setFeatureName = useToolBuilderStore(toolBuilderActions.setFeatureName)
  const setPathParamFixed = useToolBuilderStore(toolBuilderActions.setPathParamFixed)
  const setPathParamDescription = useToolBuilderStore(toolBuilderActions.setPathParamDescription)
  const setPathParamEnumValues = useToolBuilderStore(toolBuilderActions.setPathParamEnumValues)
  const addFlatField = useToolBuilderStore(toolBuilderActions.addFlatField)
  const updateFlatField = useToolBuilderStore(toolBuilderActions.updateFlatField)
  const removeFlatField = useToolBuilderStore(toolBuilderActions.removeFlatField)
  const addBodyField = useToolBuilderStore(toolBuilderActions.addBodyField)
  const updateBodyField = useToolBuilderStore(toolBuilderActions.updateBodyField)
  const removeBodyField = useToolBuilderStore(toolBuilderActions.removeBodyField)
  const addBodyFieldRef = useRef<HTMLButtonElement>(null)

  const [showValidation, setShowValidation] = useState(false)
  const [snippetCopied, setSnippetCopied] = useState(false)
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const builderState = useMemo(
    () => ({
      toolType,
      path,
      method,
      name,
      description,
      agentEnabled,
      featureMode,
      featureId,
      featureName,
      pathParams,
      headers,
      queryParams,
      bodyFields
    }),
    [toolType, path, method, name, description, agentEnabled, featureMode, featureId, featureName, pathParams, headers, queryParams, bodyFields]
  )

  const validation = useMemo(
    () => (showValidation ? validateToolState(builderState) : null),
    [builderState, showValidation]
  )

  useEffect(() => {
    if (!features.length && featureMode === "existing") {
      setFeatureMode("new")
      setFeatureId(null)
    }
  }, [features.length, featureMode, setFeatureMode, setFeatureId])

  useEffect(
    () => () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current)
        copyResetTimeoutRef.current = null
      }
    },
    []
  )

  const handleSave = () => {
    const result = validateToolState(builderState)
    setShowValidation(result.errors.length > 0)
    if (result.errors.length) {
      return
    }
    onSave()
  }

  const hasExistingFeatures = features.length > 0
  const frontendSnippet = useMemo(() => {
    const keys = bodyFields.map((field) => field.name.trim()).filter((key) => Boolean(key))
    const toolName = name.trim() || "my_frontend_tool"
    const usedNames = new Set<string>()
    const varsLines = keys
      .map((key, index) => {
        const raw = key.trim().replace(/[^a-zA-Z0-9_$]/g, "_")
        const base = raw && !/^[0-9]/.test(raw) ? raw : `value_${index + 1}`
        let candidate = base
        let suffix = 2
        while (usedNames.has(candidate)) {
          candidate = `${base}_${suffix}`
          suffix += 1
        }
        usedNames.add(candidate)
        return `    const ${candidate} = vars[${JSON.stringify(key)}]`
      })
      .join("\n")
    const varsLine = varsLines ? `${varsLines}\n` : ""
    return `window.warpy = async (toolName, vars) => {
  if (toolName === "${toolName}") {
${varsLine}    return { ok: true }
  }

  throw new Error(\`Unknown tool: \${toolName}\`)
}`
  }, [bodyFields, name])

  const handleCopySnippet = async () => {
    if (!navigator?.clipboard?.writeText) {
      return
    }
    try {
      await navigator.clipboard.writeText(frontendSnippet)
      setSnippetCopied(true)
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current)
      }
      copyResetTimeoutRef.current = setTimeout(() => {
        setSnippetCopied(false)
        copyResetTimeoutRef.current = null
      }, 1200)
    } catch {
      return
    }
  }
  const isBackendTool = toolType === "backend"

  return (
    <div className="rounded-2xl p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold leading-tight sm:text-xl">{editing ? "Edit tool" : "New tool"}</p>
          <p className="text-sm text-muted-foreground sm:text-base">
            {isBackendTool ? "Path params update automatically as you type." : "This tool runs in the browser with window.warpy(...)."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid="save-tool">
            {editing ? "Update" : "Create"}
          </Button>
        </div>
      </div>
      {validation?.errors.length ? (
        <div
          className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          data-testid="tool-validation-banner"
        >
          <p className="font-medium">Fix the highlighted fields:</p>
          <ul className="ml-4 list-disc space-y-1">
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Is this tool frontend or backend?</p>
            <p className="text-xs text-muted-foreground">Backend tools call HTTP endpoints. Frontend tools call browser handlers through window.warpy.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={isBackendTool ? "default" : "outline"}
              onClick={() => setToolType("backend")}
              data-testid="tool-type-backend"
            >
              Backend tool
            </Button>
            <Button
              size="sm"
              variant={!isBackendTool ? "default" : "outline"}
              onClick={() => setToolType("frontend")}
              data-testid="tool-type-frontend"
            >
              Frontend tool
            </Button>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Feature</p>
              <p className="text-xs text-muted-foreground">Choose how to classify this tool.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={featureMode === "auto" ? "default" : "outline"}
                onClick={() => setFeatureMode("auto")}
              >
                Auto-classify
              </Button>
              {hasExistingFeatures ? (
                <Button
                  size="sm"
                  variant={featureMode === "existing" ? "default" : "outline"}
                  onClick={() => setFeatureMode("existing")}
                >
                  Existing feature
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={featureMode === "new" ? "default" : "outline"}
                onClick={() => setFeatureMode("new")}
              >
                New feature
              </Button>
            </div>
          </div>
          {featureMode === "existing" && hasExistingFeatures ? (
            <div className="space-y-2">
              <Label>Choose feature</Label>
              <Select value={featureId ?? undefined} onValueChange={(value) => setFeatureId(value)}>
                <SelectTrigger className={cn(validation?.invalid.feature?.id && "border-destructive focus-visible:ring-destructive")}>
                  <SelectValue placeholder="Select a feature" />
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
          ) : featureMode === "new" ? (
            <div className="space-y-2">
              <Label>Feature name</Label>
              <Input
                placeholder="User Management"
                value={featureName}
                onChange={(event) => setFeatureName(event.target.value)}
                data-testid="feature-name"
                className={cn(validation?.invalid.feature?.name && "border-destructive focus-visible:ring-destructive")}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">We will auto-assign this tool or create a feature if nothing fits.</p>
          )}
        </div>
        {isBackendTool ? (
          <>
            <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr_140px]">
              <div className="space-y-2">
                <Label>Path</Label>
                <Input
                  placeholder="/users/:id/orders"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  data-testid="tool-path"
                  className={cn(
                    validation?.invalid.path && "border-destructive focus-visible:ring-destructive"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Tool name</Label>
                <Input
                  placeholder="getUserProfile"
                  value={name}
                  onChange={(event) => setName(event.target.value.replace(/\s+/g, "_"))}
                  data-testid="tool-name"
                  className={cn(
                    validation?.invalid.name && "border-destructive focus-visible:ring-destructive"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as HttpMethod)}>
                  <SelectTrigger data-testid="tool-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                placeholder="Describe what this tool does"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                data-testid="tool-description"
                className={cn(
                  "min-h-[52px] resize-y text-sm leading-5",
                  validation?.invalid.description && "border-destructive focus-visible:ring-destructive"
                )}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-3">
              <div>
                <p className="text-sm font-medium">Agent access</p>
                <p className="text-xs text-muted-foreground">Control whether the agent has access to this tool.</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={agentEnabled}
                  onCheckedChange={setAgentEnabled}
                  data-testid="agent-enabled-toggle"
                />
                {agentEnabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Path parameters</p>
                <p className="text-xs text-muted-foreground">Always required</p>
              </div>
              {pathParams.length ? (
                <div className="space-y-2">
                  {pathParams.map((param, index) => {
                    const fixedEnabled = param.fixed !== undefined
                    const enumEnabled = param.enumValues !== undefined
                    const showEnum = !fixedEnabled
                    const pathParamIssue = validation?.invalid.pathParams[index]
                    return (
                      <div
                        key={param.name || `path-param-${index}`}
                        className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="px-2 py-1 text-xs uppercase">
                              {param.name}
                            </Badge>
                            <span className="text-xs text-muted-foreground">string</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-2">
                              <Switch
                                checked={fixedEnabled}
                                data-testid={`path-param-${param.name}-fixed-toggle`}
                                onCheckedChange={(checked) => {
                                  setPathParamFixed(param.name, checked ? "" : undefined)
                                  if (checked) {
                                    setPathParamEnumValues(param.name, undefined)
                                  }
                                }}
                                aria-label="Fixed value"
                              />
                              Fixed value
                            </span>
                            {showEnum ? (
                              <span className="inline-flex items-center gap-2">
                                <Switch
                                  checked={enumEnabled}
                                  onCheckedChange={(checked) => {
                                    setPathParamEnumValues(param.name, checked ? [] : undefined)
                                    if (checked) {
                                      setPathParamFixed(param.name, undefined)
                                    }
                                  }}
                                  aria-label="Enum values"
                                />
                                Enum
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {fixedEnabled ? (
                          <Input
                            placeholder="Fixed value"
                            value={param.fixed ?? ""}
                            data-testid={`path-param-${param.name}-fixed`}
                            onChange={(event) => setPathParamFixed(param.name, event.target.value)}
                            className={cn(
                              pathParamIssue?.fixed && "border-destructive focus-visible:ring-destructive"
                            )}
                          />
                        ) : (
                          <Input
                            placeholder="Description"
                            value={param.description ?? ""}
                            onChange={(event) => setPathParamDescription(param.name, event.target.value)}
                            data-testid={`path-param-${param.name}-description`}
                            className={cn(
                              pathParamIssue?.description &&
                              "border-destructive focus-visible:ring-destructive"
                            )}
                          />
                        )}
                        {showEnum && enumEnabled ? (
                          <EnumValuesInput
                            values={param.enumValues ?? []}
                            type="string"
                            onChange={(values) => setPathParamEnumValues(param.name, values as string[])}
                            inputTestId={`path-param-${param.name}-enum`}
                            invalid={pathParamIssue?.enum}
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Add path variables with :param in the path.</p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FlatFieldList
                title="Headers"
                fields={headers}
                onAdd={() => addFlatField("headers")}
                onChange={(id, patch) => updateFlatField("headers", id, patch)}
                onRemove={(id) => removeFlatField("headers", id)}
                invalidFields={validation?.invalid.headers}
              />
              <FlatFieldList
                title="Query params"
                fields={queryParams}
                onAdd={() => addFlatField("queryParams")}
                onChange={(id, patch) => updateFlatField("queryParams", id, patch)}
                onRemove={(id) => removeFlatField("queryParams", id)}
                invalidFields={validation?.invalid.queryParams}
              />
            </div>
            {method === "GET" ? null : (
              <div className="rounded-xl border border-border/70 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium">Body</p>
                  <ActionTooltip content="Add a top-level body field">
                    <Button ref={addBodyFieldRef} size="sm" variant="outline" onClick={() => addBodyField(null)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add field
                    </Button>
                  </ActionTooltip>
                </div>
                {bodyFields.length ? (
                  <ScrollArea className="h-[70vh] min-h-[320px] pr-2">
                    <div className="space-y-2">
                      {bodyFields.map((field) => (
                        <BodyFieldRow
                          key={field.id}
                          field={field}
                          depth={0}
                          invalid={validation?.invalid.bodyFields}
                          onUpdate={updateBodyField}
                          onAdd={addBodyField}
                          onRemove={removeBodyField}
                          focusRef={addBodyFieldRef}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-xs text-muted-foreground">Add body fields.</p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tool name</Label>
                <Input
                  placeholder="open_order_drawer"
                  value={name}
                  onChange={(event) => setName(event.target.value.replace(/\s+/g, "_"))}
                  data-testid="tool-name"
                  className={cn(validation?.invalid.name && "border-destructive focus-visible:ring-destructive")}
                />
              </div>
              <div className="space-y-2">
                <Label>Agent access</Label>
                <div className="flex h-10 items-center justify-between rounded-md border border-border/70 px-3">
                  <span className="text-xs text-muted-foreground">{agentEnabled ? "Enabled" : "Disabled"}</span>
                  <Switch
                    checked={agentEnabled}
                    onCheckedChange={setAgentEnabled}
                    data-testid="agent-enabled-toggle"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                placeholder="Describe what this browser tool should do"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                data-testid="tool-description"
                className={cn(
                  "min-h-[52px] resize-y text-sm leading-5",
                  validation?.invalid.description && "border-destructive focus-visible:ring-destructive"
                )}
              />
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Tool inputs</p>
                  <p className="text-xs text-muted-foreground">Choose what information this tool can receive.</p>
                </div>
                <ActionTooltip content="Add a top-level input">
                  <Button ref={addBodyFieldRef} size="sm" variant="outline" onClick={() => addBodyField(null, "string")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add input
                  </Button>
                </ActionTooltip>
              </div>
              {bodyFields.length ? (
                <ScrollArea className="h-[70vh] min-h-[320px] pr-2">
                  <div className="space-y-2">
                    {bodyFields.map((field) => (
                      <BodyFieldRow
                        key={field.id}
                        field={field}
                        depth={0}
                        invalid={validation?.invalid.bodyFields}
                        onUpdate={updateBodyField}
                        onAdd={addBodyField}
                        onRemove={removeBodyField}
                        focusRef={addBodyFieldRef}
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-xs text-muted-foreground">No inputs yet. Add an input to tell the agent what data this tool needs.</p>
              )}
            </div>
            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Browser handler snippet</p>
                  <p className="text-xs text-muted-foreground">Register this in the host frontend app.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void handleCopySnippet()} data-testid="copy-frontend-snippet">
                  {snippetCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {snippetCopied ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-border/60 bg-background p-3 font-mono text-xs" data-testid="frontend-handler-snippet">
                {frontendSnippet}
              </pre>
              <ol className="ml-5 list-decimal space-y-1 text-xs text-muted-foreground">
                <li>Paste this into your frontend app.</li>
                <li>Implement the selected tool block.</li>
                <li>Return any JSON-serializable result.</li>
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
