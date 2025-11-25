import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toastSelectors, useToastStore } from "@/stores/toast"

export const ToastContainer = () => {
  const toasts = useToastStore(toastSelectors.toasts)
  const removeToast = useToastStore(toastSelectors.removeToast)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 space-y-2 sm:bottom-6 sm:right-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-3 shadow-lg",
            toast.variant === "error"
              ? "border-destructive/60 text-destructive"
              : "border-primary/60 text-primary"
          )}
        >
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold leading-tight">{toast.title}</p>
            {toast.description ? (
              <p className="text-xs text-muted-foreground">{toast.description}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeToast(toast.id)}
            className="h-7 w-7"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}
