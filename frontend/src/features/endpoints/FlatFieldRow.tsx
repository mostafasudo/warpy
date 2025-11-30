import { type RefObject, useRef } from "react"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { type FlatField } from "@/stores/endpoint-builder"
import type { FieldValidation } from "./validation"

type FlatFieldRowProps = {
  field: FlatField
  invalid?: FieldValidation
  onChange: (patch: Partial<FlatField>) => void
  onRemove: () => void
  focusRef?: RefObject<HTMLButtonElement | null>
}

export const FlatFieldRow = ({ field, invalid, onChange, onRemove, focusRef }: FlatFieldRowProps) => {
  const actionRef = useRef<HTMLButtonElement>(null)
  const fixedEnabled = field.fixed !== undefined
  const fixedInputValue = String(field.fixed ?? "")
  const validation = invalid ?? {}
  const handleRemove = () => {
    onRemove()
    queueMicrotask(() => focusRef?.current?.focus())
  }

  const renderDetailInput = () => {
    const detailInvalid = fixedEnabled ? validation.fixed : validation.description
    if (fixedEnabled) {
      return (
        <Input
          placeholder="Fixed value"
          value={fixedInputValue}
          onChange={(event) => onChange({ fixed: event.target.value })}
          className={cn(
            "h-10",
            detailInvalid && "border-destructive focus-visible:ring-destructive"
          )}
          data-testid={`field-${field.id}-fixed`}
        />
      )
    }
    return (
      <Textarea
        placeholder="Description"
        value={field.description}
        onChange={(event) => onChange({ description: event.target.value })}
        data-testid={`field-${field.id}-description`}
        rows={1}
        className={cn(
          "min-h-[44px] resize-none text-sm leading-5",
          detailInvalid && "border-destructive focus-visible:ring-destructive"
        )}
      />
    )
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-[minmax(120px,160px)_minmax(240px,1fr)_auto] sm:items-start">
        <Input
          placeholder="Name"
          value={field.name}
          onChange={(event) => onChange({ name: event.target.value })}
          data-testid={`field-${field.id}-name`}
          className={cn(
            "h-10",
            validation.name && "border-destructive focus-visible:ring-destructive"
          )}
        />
        {renderDetailInput()}
        <div className="flex items-start justify-end">
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
                  handleRemove()
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
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Switch checked={field.required} onCheckedChange={(checked) => onChange({ required: checked })} />
          Required
        </span>
        <span className="inline-flex items-center gap-2">
          <Switch
            checked={fixedEnabled}
            onCheckedChange={(checked) => onChange({ fixed: checked ? "" : undefined })}
          />
          Fixed value
        </span>
      </div>
    </div>
  )
}
