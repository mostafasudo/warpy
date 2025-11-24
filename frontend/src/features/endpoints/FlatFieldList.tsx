import { Plus } from "lucide-react"

import { ActionTooltip } from "@/components/action-tooltip"
import { Button } from "@/components/ui/button"
import { type FlatField } from "@/stores/endpoint-builder"
import { FlatFieldRow } from "./FlatFieldRow"
import type { FieldValidation } from "./validation"

type FlatFieldListProps = {
  title: string
  fields: FlatField[]
  onAdd: () => void
  onChange: (id: string, patch: Partial<FlatField>) => void
  onRemove: (id: string) => void
  invalidFields?: Record<string, FieldValidation>
}

export const FlatFieldList = ({ title, fields, onAdd, onChange, onRemove, invalidFields }: FlatFieldListProps) => (
  <div className="rounded-xl border border-border/70 p-3">
    <div className="mb-3 flex items-center justify-between">
      <p className="text-sm font-medium">{title}</p>
      <ActionTooltip content={`Add ${title}`}>
        <Button
          size="sm"
          variant="outline"
          onClick={onAdd}
          data-testid={`add-${title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </ActionTooltip>
    </div>
    <div className="space-y-2">
      {fields.length ? (
        fields.map((field) => (
          <FlatFieldRow
            key={field.id}
            field={field}
            invalid={invalidFields?.[field.id]}
            onChange={(patch) => onChange(field.id, patch)}
            onRemove={() => onRemove(field.id)}
          />
        ))
      ) : (
        <p className="text-xs text-muted-foreground">No fields yet.</p>
      )}
    </div>
  </div>
)
