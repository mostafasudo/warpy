import { useState } from "react"
import { X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type EnumValuesInputProps = {
  values: (string | number)[]
  type: "string" | "number"
  onChange: (values: (string | number)[]) => void
  inputTestId?: string
  invalid?: boolean
}

export const EnumValuesInput = ({ values, type, onChange, inputTestId, invalid }: EnumValuesInputProps) => {
  const [draft, setDraft] = useState("")
  const isNumber = type === "number"
  const trimmedDraft = draft.trim()
  const parsedNumber = isNumber ? Number(trimmedDraft) : null
  const duplicate = isNumber
    ? trimmedDraft !== "" && !Number.isNaN(parsedNumber) && values.some((item) => Number(item) === parsedNumber)
    : trimmedDraft !== "" && values.includes(trimmedDraft)
  const canAdd =
    !trimmedDraft
      ? false
      : isNumber
        ? !Number.isNaN(parsedNumber ?? NaN) && !duplicate
        : !duplicate

  const addValue = () => {
    if (!canAdd) {
      return
    }
    const value = isNumber ? Number(trimmedDraft) : trimmedDraft
    onChange([...values, value])
    setDraft("")
  }

  const removeValue = (target: string | number) => {
    onChange(values.filter((value) => value !== target))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const key = `${typeof value}:${String(value)}`
          return (
            <Badge key={key} variant="secondary" className="flex items-center gap-1">
              <span>{String(value)}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-5 w-5"
                onClick={() => removeValue(value)}
                aria-label={`Remove ${value}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )
        })}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addValue()
            }
          }}
          placeholder="Add value"
          type={isNumber ? "number" : "text"}
          className={cn(invalid && "border-destructive focus-visible:ring-destructive")}
          data-testid={inputTestId}
        />
        <Button
          type="button"
          onClick={addValue}
          disabled={!canAdd}
          data-testid={inputTestId ? `${inputTestId}-add` : undefined}
        >
          Add
        </Button>
      </div>
    </div>
  )
}
