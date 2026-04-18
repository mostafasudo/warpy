import { useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { AgentWidgetConfigUpdate } from "@/types"

import { WIDGET_PREVIEW_SCENES, type WidgetPreviewScene, type WidgetThemeVariant } from "./widget-theme"

type WidgetThemePreviewProps = {
  draftConfig: AgentWidgetConfigUpdate
  previewScene: WidgetPreviewScene
  previewVariant: WidgetThemeVariant
  onPreviewSceneChange: (scene: WidgetPreviewScene) => void
  onPreviewVariantChange: (variant: WidgetThemeVariant) => void
}

type PreviewSnapshot = {
  isOpen?: boolean
  scene?: string
  securityPanelOpen?: boolean
  messageCount?: number
}

const PREVIEW_SRC = "/widget/preview.html"

export const WidgetThemePreview = ({
  draftConfig,
  previewScene,
  previewVariant,
  onPreviewSceneChange,
  onPreviewVariantChange,
}: WidgetThemePreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const readyRef = useRef(false)
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null)

  const sceneOptions = useMemo(
    () =>
      WIDGET_PREVIEW_SCENES.filter((scene) =>
        draftConfig.widgetSecurityDisclosureEnabled ? true : scene.key !== "security",
      ),
    [draftConfig.widgetSecurityDisclosureEnabled],
  )

  const previewPayload = useMemo(
    () => ({
      type: "warpy-widget-preview:update",
      config: draftConfig,
      previewColorScheme: previewVariant,
    }),
    [draftConfig, previewVariant],
  )

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const payload = event.data
      if (!payload || typeof payload !== "object") return
      if (payload.type === "warpy-widget-preview:ready") {
        readyRef.current = true
        iframeRef.current?.contentWindow?.postMessage(previewPayload, window.location.origin)
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "warpy-widget-preview:update",
            scene: previewScene,
          },
          window.location.origin,
        )
        if (payload.snapshot && typeof payload.snapshot === "object") {
          setSnapshot(payload.snapshot as PreviewSnapshot)
        }
        return
      }
      if (payload.type === "warpy-widget-preview:stateSnapshot" || payload.type === "warpy-widget-preview:sceneChanged") {
        if (payload.snapshot && typeof payload.snapshot === "object") {
          setSnapshot(payload.snapshot as PreviewSnapshot)
        }
      }
    }

    window.addEventListener("message", handleMessage)
    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [previewPayload, previewScene])

  useEffect(() => {
    if (!readyRef.current) return
    iframeRef.current?.contentWindow?.postMessage(previewPayload, window.location.origin)
  }, [previewPayload])

  useEffect(() => {
    if (!readyRef.current) return
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "warpy-widget-preview:update",
        scene: previewScene,
      },
      window.location.origin,
    )
  }, [previewScene])

  useEffect(() => {
    if (draftConfig.widgetSecurityDisclosureEnabled || previewScene !== "security") return
    onPreviewSceneChange("empty")
  }, [draftConfig.widgetSecurityDisclosureEnabled, onPreviewSceneChange, previewScene])

  return (
    <div className="sticky top-6 self-start space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Live preview</p>
          </div>
          <Badge variant="secondary">
            {snapshot?.isOpen ? "Open" : "Closed"}
          </Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1">
            {(["light", "dark"] as const).map((variant) => (
              <button
                key={variant}
                type="button"
                onClick={() => onPreviewVariantChange(variant)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  previewVariant === variant
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background hover:text-foreground"
                }`}
              >
                {variant === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {sceneOptions.map((scene) => (
              <Button
                key={scene.key}
                type="button"
                size="sm"
                variant={previewScene === scene.key ? "default" : "outline"}
                onClick={() => onPreviewSceneChange(scene.key)}
              >
                {scene.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-border/70 bg-muted/20 shadow-sm">
        <iframe
          ref={iframeRef}
          src={PREVIEW_SRC}
          title="Widget live preview"
          className="block h-[720px] w-full border-0 bg-transparent"
          data-testid="widget-theme-preview-frame"
        />
      </div>
    </div>
  )
}
