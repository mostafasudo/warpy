import { useRef } from "react"
import { Trash2 } from "lucide-react"

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
import { type FlatField } from "@/stores/endpoint-builder"
import type { FieldValidation } from "./validation"

type FlatFieldRowProps = {
  field: FlatField
  invalid?: FieldValidation
  onChange: (patch: Partial<FlatField>) => void
  onRemove: () => void
}

export const FlatFieldRow = ({ field, invalid, onChange, onRemove }: FlatFieldRowProps) => {
  const actionRef = useRef<HTMLButtonElement>(null)
  const fixedEnabled = field.fixed !== undefined
  const fixedInputValue = typeof field.fixed === "boolean" ? "" : field.fixed ?? ""
  const validation = invalid ?? {}

  const renderDetailInput = () => {
    const detailInvalid = fixedEnabled ? validation.fixed : validation.description
    if (fixedEnabled) {
      if (field.type === "boolean") {
        return (
          <Select
            value={String(field.fixed ?? false)}
            onValueChange={(value) => onChange({ fixed: value === "true" })}
          >
            <SelectTrigger
              className={cn(
                "w-full sm:w-48",
                detailInvalid && "border-destructive focus-visible:ring-destructive"
              )}
              data-testid={`field-${field.id}-fixed`}
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
      return (
        <Input
          placeholder="Fixed value"
          type={field.type === "number" ? "number" : "text"}
          value={fixedInputValue}
          onChange={(event) =>
            onChange({
              fixed: field.type === "number" ? Number(event.target.value) : event.target.value
            })
          }
          className={cn(
            "w-full sm:w-48",
            detailInvalid && "border-destructive focus-visible:ring-destructive"
          )}
          data-testid={`field-${field.id}-fixed`}
        />
      )
    }
    return (
      <Input
        placeholder="Description"
        value={field.description}
        onChange={(event) => onChange({ description: event.target.value })}
        data-testid={`field-${field.id}-description`}
        className={cn(
          "w-full sm:w-48",
          detailInvalid && "border-destructive focus-visible:ring-destructive"
        )}
      />
    )
  }

  const handleTypeChange = (type: FlatField["type"]) => {
    const base: Partial<FlatField> = { type }
    if (fixedEnabled) {
      if (type === "boolean") {
        base.fixed = Boolean(field.fixed)
      } else if (type === "number") {
        const numeric = Number(field.fixed)
        base.fixed = Number.isNaN(numeric) ? 0 : numeric
      } else {
        base.fixed = typeof field.fixed === "string" ? field.fixed : ""
      }
    }
    onChange(base)
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-[1.1fr_200px]">
        <div className="space-y-2">
          <Input
            placeholder="Name"
            value={field.name}
            onChange={(event) => onChange({ name: event.target.value })}
            data-testid={`field-${field.id}-name`}
            className={cn(
              validation.name && "border-destructive focus-visible:ring-destructive"
            )}
          />
          {renderDetailInput()}
        </div>
        <div className="space-y-2">
          <Select value={field.type} onValueChange={(value) => handleTypeChange(value as FlatField["type"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">string</SelectItem>
              <SelectItem value="number">number</SelectItem>
              <SelectItem value="boolean">boolean</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Switch checked={field.required} onCheckedChange={(checked) => onChange({ required: checked })} />
          Required
        </span>
        <span className="inline-flex items-center gap-2">
          <Switch
            checked={fixedEnabled}
            onCheckedChange={(checked) =>
              onChange({ fixed: checked ? (field.type === "boolean" ? false : "") : undefined })
            }
          />
          Fixed value
        </span>
      </div>
      <div className="flex justify-end">
        <AlertDialog>
          <ActionTooltip content="Remove this field">
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" data-testid={`remove-flat-field-${field.id}`}>
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
                onRemove()
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Remove field?</AlertDialogTitle>
                <AlertDialogDescription>This will delete the field from this endpoint draft.</AlertDialogDescription>
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
  )
}
