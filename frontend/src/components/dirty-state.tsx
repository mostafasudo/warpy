import type { ComponentProps, ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type UnsavedBadgeProps = ComponentProps<typeof Badge>

export const UnsavedBadge = ({ className, ...props }: UnsavedBadgeProps) => (
  <Badge
    variant="secondary"
    className={cn(
      "h-5 rounded-md bg-primary/10 px-2 text-[10px] font-bold uppercase tracking-wide text-primary",
      className
    )}
    {...props}
  >
    Unsaved
  </Badge>
)

type DirtyActionsProps = {
  onDiscard: () => void
  discardDisabled?: boolean
  discardLabel?: string
  discardTestId?: string
  onPrimary: () => void
  primaryDisabled?: boolean
  primaryLabel?: string
  primaryPending?: boolean
  primaryTestId?: string
  secondaryAction?: ReactNode
  className?: string
}

export const DirtyActions = ({
  onDiscard,
  discardDisabled = false,
  discardLabel = "Discard changes",
  discardTestId,
  onPrimary,
  primaryDisabled = false,
  primaryLabel = "Save changes",
  primaryPending = false,
  primaryTestId,
  secondaryAction,
  className
}: DirtyActionsProps) => {
  return (
    <div className={cn("flex flex-col justify-end gap-2 border-t border-border pt-4 sm:flex-row", className)}>
      <Button
        variant="ghost"
        onClick={onDiscard}
        disabled={discardDisabled}
        className="w-full justify-center sm:w-auto"
        data-testid={discardTestId}
      >
        {discardLabel}
      </Button>
      {secondaryAction}
      <Button
        onClick={onPrimary}
        disabled={primaryDisabled}
        className="w-full justify-center sm:w-auto"
        data-testid={primaryTestId}
      >
        {primaryPending ? `${primaryLabel}...` : primaryLabel}
      </Button>
    </div>
  )
}
