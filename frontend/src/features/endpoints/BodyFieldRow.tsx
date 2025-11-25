import { useRef } from "react"
import { Plus, Trash2 } from "lucide-react"

import { ActionTooltip } from "@/components/action-tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { type BodyField } from "@/stores/endpoint-builder"
import type { FieldValidation } from "./validation"

type BodyFieldRowProps = {
  field: BodyField
  depth: number
  invalid?: Record<string, FieldValidation>
  onUpdate: (id: string, patch: Partial<BodyField>) => void
  onAdd: (parentId: string | null, type?: BodyField["type"]) => void
  onRemove: (id: string) => void
}

export const BodyFieldRow = ({ field, depth, invalid, onUpdate, onAdd, onRemove }: BodyFieldRowProps) => {
  const actionRef = useRef<HTMLButtonElement>(null)
  const fixedEnabled = field.fixed !== undefined
  const canNest = field.type === "object" || field.type === "array:object"
  const isPrimitive = field.type === "string" || field.type === "number" || field.type === "boolean"
  const indent = depth * 16
  const validation = invalid?.[field.id] ?? {}

  const handleTypeChange = (type: BodyField["type"]) => {
    const newFixed =
      field.fixed === undefined
        ? undefined
        : type === "boolean"
          ? (typeof field.fixed === "boolean" ? field.fixed : false)
          : type === "number"
            ? (typeof field.fixed === "number" ? field.fixed : "")
            : type === "string"
              ? (typeof field.fixed === "string" ? field.fixed : "")
              : undefined

    onUpdate(field.id, {
      type,
      fixed: newFixed
    })
  }

  const renderFixedInput = (className?: string, invalidFixed?: boolean) => {
    if (field.type === "boolean") {
      return (
        <Select
          value={String(field.fixed ?? false)}
          disabled={!fixedEnabled}
          onValueChange={(value) => onUpdate(field.id, { fixed: value === "true" })}
        >
          <SelectTrigger
            className={cn(
              className,
              invalidFixed && "border-destructive focus-visible:ring-destructive"
            )}
            data-testid={`body-field-${field.id}-fixed`}
          >
            <SelectValue placeholder="Fixed value" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">true</SelectItem>
            <SelectItem value="false">false</SelectItem>
          </SelectContent>
        </Select>
      )
    }
    const isNumber = field.type === "number"
    const fixedValue = typeof field.fixed === "boolean" ? "" : field.fixed ?? ""
    return (
      <Input
        type={isNumber ? "number" : "text"}
        placeholder="Fixed value"
        value={fixedValue}
        disabled={!fixedEnabled}
        onChange={(event) =>
          onUpdate(field.id, {
            fixed: isNumber ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value
          })
        }
        className={cn(
          className,
          invalidFixed && "border-destructive focus-visible:ring-destructive"
        )}
        data-testid={`body-field-${field.id}-fixed`}
      />
    )
  }

  return (
    <div
      className="w-full space-y-2"
      style={{ marginLeft: indent }}
    >
      <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm min-w-[320px] sm:min-w-[520px]">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Input
            placeholder="Field name"
            value={field.name}
            onChange={(event) => onUpdate(field.id, { name: event.target.value })}
            className={cn(
              validation.name && "border-destructive focus-visible:ring-destructive"
            )}
          />
          {isPrimitive && fixedEnabled ? (
            renderFixedInput("w-full sm:w-48", validation.fixed)
          ) : (
            <Input
              placeholder="Description"
              value={field.description}
              onChange={(event) => onUpdate(field.id, { description: event.target.value })}
              className={cn(
                "w-full sm:w-48",
                validation.description && "border-destructive focus-visible:ring-destructive"
              )}
              data-testid={`body-field-${field.id}-description`}
            />
          )}
          <Select value={field.type} onValueChange={(value) => handleTypeChange(value as BodyField["type"])}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">string</SelectItem>
              <SelectItem value="number">number</SelectItem>
              <SelectItem value="boolean">boolean</SelectItem>
              <SelectItem value="object">object</SelectItem>
              <SelectItem value="array:string">array of string</SelectItem>
              <SelectItem value="array:number">array of number</SelectItem>
              <SelectItem value="array:boolean">array of boolean</SelectItem>
              <SelectItem value="array:object">array of object</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Switch
                checked={field.required}
                onCheckedChange={(checked) => onUpdate(field.id, { required: checked })}
              />
              Required
            </span>
            {field.type === "string" || field.type === "number" || field.type === "boolean" ? (
              <span className="inline-flex items-center gap-2">
                <Switch
                  checked={fixedEnabled}
                  onCheckedChange={(checked) =>
                    onUpdate(field.id, { fixed: checked ? (field.type === "boolean" ? false : "") : undefined })
                  }
                />
                Fixed value
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {canNest && (
              <ActionTooltip content="Add a nested field">
                <Button size="sm" variant="outline" onClick={() => onAdd(field.id, "string")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add child
                </Button>
              </ActionTooltip>
            )}
            <AlertDialog>
              <ActionTooltip content="Remove this field">
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" data-testid={`remove-body-field-${field.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
              </ActionTooltip>
              <AlertDialogContent
                onOpenAutoFocus={(event) => {
                  event.preventDefault()
                  actionRef.current?.focus()
                }}
              >
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onRemove(field.id)
                  }}
                >
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove field?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Delete {field.name || "this field"} and any nested values.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                    <AlertDialogAction ref={actionRef} type="submit">
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </form>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
      {canNest && field.children?.length ? (
        <div className="space-y-2 border-l-2 border-border/60 pl-4">
          {field.children.map((child) => (
            <BodyFieldRow
              key={child.id}
              field={child}
              depth={depth + 1}
              invalid={invalid}
              onUpdate={onUpdate}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
