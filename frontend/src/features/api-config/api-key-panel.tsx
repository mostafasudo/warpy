import { useState } from "react"
import { Check, Copy, RotateCw } from "lucide-react"

import { PanelShell } from "@/components/panel-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { maskApiKey } from "@/lib/agent-integration"
import { useRevealApiKey } from "@/mutations/use-reveal-api-key"
import { useRotateApiKey } from "@/mutations/use-rotate-api-key"
import { useApiKeyQuery } from "@/queries/use-api-key"
import { toastSelectors, useToastStore } from "@/stores/toast"

export const ApiKeyPanel = () => {
  const apiKeyQuery = useApiKeyQuery()
  const revealApiKey = useRevealApiKey()
  const rotateApiKey = useRotateApiKey()
  const addToast = useToastStore(toastSelectors.addToast)
  const [copied, setCopied] = useState<string | null>(null)
  const [rotatedKey, setRotatedKey] = useState<string | null>(null)

  const handleCopy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1800)
  }

  const handleCopyCurrentKey = async () => {
    try {
      const response = await revealApiKey.mutateAsync()
      await handleCopy(response.apiKey, "current-key")
      addToast({ title: "API key copied", description: "The current Warpy API key is in your clipboard.", variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not copy the API key"
      addToast({ title: "Copy failed", description: message, variant: "error" })
    }
  }

  const handleRotate = async () => {
    try {
      const response = await rotateApiKey.mutateAsync()
      setRotatedKey(response.apiKey)
      addToast({ title: "API key rotated", description: "Save or copy the new key before you leave this page.", variant: "success" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not rotate the API key"
      addToast({ title: "Rotate failed", description: message, variant: "error" })
    }
  }

  return (
    <PanelShell title="Warpy API Key" description="Use this key to control Warpy via agents.">
      <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="warpy-api-key">Current key</Label>
            {apiKeyQuery.isPending ? (
              <Skeleton className="h-10 w-full rounded-lg" />
            ) : (
              <Input
                id="warpy-api-key"
                readOnly
                value={apiKeyQuery.data ? maskApiKey(apiKeyQuery.data.apiKeyLast4) : ""}
                className="font-mono"
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void handleCopyCurrentKey()} disabled={apiKeyQuery.isPending || revealApiKey.isPending}>
              <Copy className="h-4 w-4" />
              {copied === "current-key" ? "Copied" : "Copy current key"}
            </Button>
            <Button type="button" onClick={() => void handleRotate()} disabled={apiKeyQuery.isPending || rotateApiKey.isPending}>
              <RotateCw className="h-4 w-4" />
              Rotate key
            </Button>
          </div>
        </div>

        {rotatedKey ? (
          <div className="space-y-2 rounded-xl border border-border/70 bg-card/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">New key</p>
                <p className="text-sm text-muted-foreground">Update any server-side use of the previous key now.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await handleCopy(rotatedKey, "rotated-key")
                    addToast({ title: "API key copied", description: "The new API key is in your clipboard.", variant: "success" })
                  } catch {
                    addToast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "error" })
                  }
                }}
              >
                {copied === "rotated-key" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "rotated-key" ? "Copied" : "Copy"}
              </Button>
            </div>
            <Textarea readOnly rows={2} value={rotatedKey} className="font-mono" />
          </div>
        ) : null}
      </div>
    </PanelShell>
  )
}
