import { useMemo, useRef, useState } from "react"
import { Plus } from "lucide-react"

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
  endpointBuilderActions,
  endpointBuilderSelectors,
  useEndpointBuilderStore
} from "@/stores/endpoint-builder"
import { type HttpMethod } from "@/types"
import { BodyFieldRow } from "./BodyFieldRow"
import { FlatFieldList } from "./FlatFieldList"
import { endpointNamePattern } from "./constants"
import { validateEndpointState } from "./validation"

type EndpointEditorProps = {
  editing: boolean
  isSaving: boolean
  onSave: () => void
  onClose: () => void
}

export const EndpointEditor = ({ editing, isSaving, onSave, onClose }: EndpointEditorProps) => {
  const path = useEndpointBuilderStore(endpointBuilderSelectors.path)
  const method = useEndpointBuilderStore(endpointBuilderSelectors.method)
  const name = useEndpointBuilderStore(endpointBuilderSelectors.name)
  const description = useEndpointBuilderStore(endpointBuilderSelectors.description)
  const agentEnabled = useEndpointBuilderStore(endpointBuilderSelectors.agentEnabled)
  const pathParams = useEndpointBuilderStore(endpointBuilderSelectors.pathParams)
  const headers = useEndpointBuilderStore(endpointBuilderSelectors.headers)
  const queryParams = useEndpointBuilderStore(endpointBuilderSelectors.queryParams)
  const bodyFields = useEndpointBuilderStore(endpointBuilderSelectors.bodyFields)
  const setPath = useEndpointBuilderStore(endpointBuilderActions.setPath)
  const setMethod = useEndpointBuilderStore(endpointBuilderActions.setMethod)
  const setName = useEndpointBuilderStore(endpointBuilderActions.setName)
  const setDescription = useEndpointBuilderStore(endpointBuilderActions.setDescription)
  const setAgentEnabled = useEndpointBuilderStore(endpointBuilderActions.setAgentEnabled)
  const setPathParamFixed = useEndpointBuilderStore(endpointBuilderActions.setPathParamFixed)
  const setPathParamDescription = useEndpointBuilderStore(endpointBuilderActions.setPathParamDescription)
  const addFlatField = useEndpointBuilderStore(endpointBuilderActions.addFlatField)
  const updateFlatField = useEndpointBuilderStore(endpointBuilderActions.updateFlatField)
  const removeFlatField = useEndpointBuilderStore(endpointBuilderActions.removeFlatField)
  const addBodyField = useEndpointBuilderStore(endpointBuilderActions.addBodyField)
  const updateBodyField = useEndpointBuilderStore(endpointBuilderActions.updateBodyField)
  const removeBodyField = useEndpointBuilderStore(endpointBuilderActions.removeBodyField)
  const addBodyFieldRef = useRef<HTMLButtonElement>(null)

  const [showValidation, setShowValidation] = useState(false)

  const builderState = useMemo(
    () => ({
      path,
      method,
      name,
      description,
      agentEnabled,
      pathParams,
      headers,
      queryParams,
      bodyFields
    }),
    [path, method, name, description, agentEnabled, pathParams, headers, queryParams, bodyFields]
  )

  const validation = useMemo(
    () => (showValidation ? validateEndpointState(builderState) : null),
    [builderState, showValidation]
  )

  const handleSave = () => {
    const result = validateEndpointState(builderState)
    setShowValidation(result.errors.length > 0)
    if (result.errors.length) {
      return
    }
    onSave()
  }

  const isNameValid = Boolean(name.trim() && endpointNamePattern.test(name))

  return (
    <div className="rounded-2xl bg-card/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{editing ? "Edit endpoint" : "New endpoint"}</p>
          <p className="text-xs text-muted-foreground">Path params update automatically as you type.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid="save-endpoint">
            {editing ? "Update" : "Create"}
          </Button>
        </div>
      </div>
      {validation?.errors.length ? (
        <div
          className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          data-testid="endpoint-validation-banner"
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
        <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr_140px]">
          <div className="space-y-2">
            <Label>Path</Label>
            <Input
              placeholder="/users/:id/orders"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              data-testid="endpoint-path"
              className={cn(
                validation?.invalid.path && "border-destructive focus-visible:ring-destructive"
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>Endpoint name</Label>
            <Input
              placeholder="getUserProfile"
              value={name}
              onChange={(event) => setName(event.target.value.replace(/\s+/g, "_"))}
              data-testid="endpoint-name"
              className={cn(
                validation?.invalid.name && "border-destructive focus-visible:ring-destructive"
              )}
            />
            {name.trim() && !isNameValid ? (
              <p className="text-xs text-destructive">Use letters, numbers, underscores, or dashes (max 64).</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as HttpMethod)}>
              <SelectTrigger data-testid="endpoint-method">
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
            placeholder="Describe what this endpoint does"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            data-testid="endpoint-description"
            className={cn(
              "min-h-[52px] resize-y text-sm leading-5",
              validation?.invalid.description && "border-destructive focus-visible:ring-destructive"
            )}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-3">
          <div>
            <p className="text-sm font-medium">Agent access</p>
            <p className="text-xs text-muted-foreground">Control whether the agent has access to this endpoint.</p>
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
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={fixedEnabled}
                          data-testid={`path-param-${param.name}-fixed-toggle`}
                          onCheckedChange={(checked) => setPathParamFixed(param.name, checked ? "" : undefined)}
                        />
                        Fixed value
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
      </div>
    </div>
  )
}
