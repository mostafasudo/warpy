import { Mic, Send, Shield, X } from "lucide-react"
import type { CSSProperties } from "react"
import clsx from "clsx"

import { mergeWidgetStyles } from "@/types/widget-styles"
import type { WidgetStyles } from "@/types/widget-styles"

type WidgetPreviewProps = {
  widgetTitle: string
  widgetSubtitle: string
  widgetIconUrl: string | null
  widgetEmptyTitle: string
  widgetEmptyDescription: string
  widgetInputPlaceholder: string
  widgetSecurityDisclosureEnabled: boolean
  widgetStyles: WidgetStyles | null
}

const STATIC_MESSAGES = [
  { role: "user", content: "Can you help me track my order?" },
  {
    role: "assistant",
    content:
      "Of course! I can help you track your order. Please provide your order number."
  }
]

export const WidgetPreview = ({
  widgetTitle,
  widgetSubtitle,
  widgetIconUrl,
  widgetEmptyTitle,
  widgetEmptyDescription,
  widgetInputPlaceholder,
  widgetSecurityDisclosureEnabled,
  widgetStyles
}: WidgetPreviewProps) => {
  const styles = mergeWidgetStyles(widgetStyles)
  const accent = styles.colors.primary
  const baseVars = {
    "--cta-bg": styles.colors.background,
    "--cta-surface": styles.colors.surface,
    "--cta-border": styles.colors.border,
    "--cta-fg": styles.colors.text,
    "--cta-fg-muted": styles.colors.textMuted,
    "--cta-accent": styles.colors.primary,
    "--cta-accent-contrast": styles.colors.text,
    "--cta-bubble-user": "rgba(17, 24, 39, 0.08)",
    "--cta-bubble-assistant": "rgba(17, 24, 39, 0.06)",
    "--cta-code-bg": "rgba(17, 24, 39, 0.1)",
    "--cta-container-padding": `${styles.spacing.containerPadding}px`,
    "--cta-message-padding": `${styles.spacing.messagePadding}px`,
    "--cta-input-padding": `${styles.spacing.inputPadding}px`,
    "--cta-message-gap": `${styles.spacing.messageGap}px`,
    "--cta-section-gap": `${styles.spacing.sectionGap}px`,
    "--cta-border-container": `${styles.borders.containerWidth}px`,
    "--cta-border-message": `${styles.borders.messageWidth}px`,
    "--cta-border-button": `${styles.borders.buttonWidth}px`,
    "--cta-input-border-width": `${styles.borders.inputWidth}px`,
    "--cta-container-radius": `${styles.borders.containerRadius}px`,
    "--cta-message-radius": `${styles.borders.messageRadius}px`,
    "--cta-button-radius": `${styles.borders.buttonRadius}px`,
    "--cta-input-radius": `${styles.borders.inputRadius}px`,
    "--cta-font-family": styles.typography.fontFamily,
    "--cta-font-size-base": `${styles.typography.fontSizeBase}px`,
    "--cta-font-size-small": `${styles.typography.fontSizeSmall}px`,
    "--cta-font-size-large": `${styles.typography.fontSizeLarge}px`,
    "--cta-font-weight-normal": styles.typography.fontWeightNormal,
    "--cta-font-weight-medium": styles.typography.fontWeightMedium,
    "--cta-font-weight-bold": styles.typography.fontWeightBold,
    "--cta-line-height": styles.typography.lineHeight,
    "--cta-shadow-widget": styles.shadows.widget,
    "--cta-shadow-panel": styles.shadows.widget,
    "--cta-shadow-message": styles.shadows.message,
    "--cta-shadow-button": styles.shadows.button
  } as CSSProperties

  return (
    <div className="flex flex-col gap-4" style={baseVars}>
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-card shadow-lg"
          style={{
            borderWidth: styles.borders.containerWidth,
            borderColor: styles.colors.border,
            backgroundColor: styles.colors.surface,
            boxShadow: styles.shadows.widget
          }}
        >
          {widgetIconUrl ? (
            <img
              src={widgetIconUrl}
              alt="Widget icon"
              className="h-5 w-5 rounded object-contain"
            />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
              style={{ color: accent }}
              aria-hidden="true"
            >
              <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z" />
              <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
              <path d="M18 14l.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5z" />
            </svg>
          )}
        </div>
        <span className="text-xs text-muted-foreground">Toggle button</span>
      </div>

      <div
        className="flex flex-col overflow-hidden border shadow-xl"
        style={{
          borderWidth: styles.borders.containerWidth,
          borderColor: styles.colors.border,
          backgroundColor: styles.colors.surface,
          color: styles.colors.text,
          borderRadius: styles.borders.containerRadius,
          boxShadow: styles.shadows.widget,
          maxHeight: 360
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3"
          style={{
            padding: `10px ${styles.spacing.containerPadding}px`,
            backgroundColor: styles.colors.background,
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)"
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center border"
              style={{
                borderWidth: styles.borders.containerWidth,
                borderRadius: 10,
                borderColor: styles.colors.border,
                backgroundColor: "var(--cta-bubble-assistant)"
              }}
            >
            {widgetIconUrl ? (
              <img
                src={widgetIconUrl}
                alt="Widget icon"
                className="h-4 w-4 rounded object-contain"
              />
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
                style={{ color: accent }}
                aria-hidden="true"
              >
                <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z" />
                <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
                <path d="M18 14l.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5z" />
              </svg>
            )}
          </div>
            <div className="min-w-0">
              <p
                className="truncate"
                style={{ fontSize: styles.typography.fontSizeLarge, fontWeight: styles.typography.fontWeightBold }}
              >
                {widgetTitle}
              </p>
              <p
                className="truncate"
                style={{ fontSize: styles.typography.fontSizeSmall, color: styles.colors.textMuted }}
              >
                {widgetSubtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {widgetSecurityDisclosureEnabled ? (
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center"
                style={{
                  borderRadius: 10,
                  color: styles.colors.textMuted
                }}
                aria-label="Security & Privacy"
              >
                <Shield className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              className="px-2 text-xs"
              style={{
                borderRadius: 10,
                color: styles.colors.textMuted
              }}
            >
              New chat
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center"
              style={{
                borderRadius: 10,
                color: styles.colors.textMuted
              }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className="flex flex-1 flex-col overflow-y-auto"
          style={{
            padding: styles.spacing.containerPadding,
            gap: styles.spacing.messageGap
          }}
        >
          {STATIC_MESSAGES.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm font-medium">{widgetEmptyTitle}</p>
              <p className="text-xs" style={{ color: styles.colors.textMuted }}>
                {widgetEmptyDescription}
              </p>
            </div>
          ) : (
            STATIC_MESSAGES.map((msg, idx) => (
              <div
                key={idx}
                className={clsx("max-w-[85%] text-xs", msg.role === "user" ? "ml-auto" : "mr-auto")}
                style={{
                  padding: styles.spacing.messagePadding,
                  borderRadius: styles.borders.messageRadius,
                  borderWidth: styles.borders.messageWidth,
                  borderStyle: styles.borders.messageWidth ? "solid" : "none",
                  borderColor: styles.colors.border,
                  backgroundColor: msg.role === "user" ? "rgba(17, 24, 39, 0.08)" : "rgba(17, 24, 39, 0.06)",
                  boxShadow: styles.shadows.message
                }}
              >
                {msg.content}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            padding: `10px ${styles.spacing.containerPadding}px`,
            backgroundColor: styles.colors.background,
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)"
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex-1 text-xs"
              style={{
                height: 42,
                display: "flex",
                alignItems: "center",
                borderRadius: styles.borders.inputRadius,
                borderWidth: styles.borders.inputWidth,
                borderStyle: styles.borders.inputWidth ? "solid" : "none",
                borderColor: styles.colors.border,
                backgroundColor: styles.colors.surface,
                padding: `0 ${styles.spacing.inputPadding}px`,
                color: styles.colors.textMuted
              }}
            >
              {widgetInputPlaceholder}
            </div>
            <div className="flex items-center">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center"
                style={{
                  borderRadius: styles.borders.buttonRadius,
                  color: styles.colors.textMuted,
                  backgroundColor: "transparent"
                }}
                aria-label="Start voice input"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex h-10 w-7"
                style={{
                  borderRadius: `0 ${styles.borders.buttonRadius}px ${styles.borders.buttonRadius}px 0`,
                  color: styles.colors.text,
                  backgroundColor: "transparent"
                }}
                aria-label="Select microphone"
              >
              </button>
            </div>
            <button
              className="flex h-10 w-10 items-center justify-center text-white"
              style={{
                color: "black",
                borderRadius: styles.borders.buttonRadius,
              }}
              disabled
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
