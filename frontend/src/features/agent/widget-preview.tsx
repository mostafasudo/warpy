import { Sparkles } from "lucide-react"

type WidgetPreviewProps = {
  title: string
  subtitle: string
  iconUrl: string | null
  emptyTitle: string
  emptyDescription: string
  inputPlaceholder: string
  primaryColor: string | null
  textColor: string | null
  backgroundColor: string | null
  borderWidthContainer: number | null
  borderWidthMessage: number | null
  borderWidthButton: number | null
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
  title,
  subtitle,
  iconUrl,
  emptyTitle,
  emptyDescription,
  inputPlaceholder,
  primaryColor,
  textColor,
  backgroundColor,
  borderWidthContainer,
  borderWidthMessage,
  borderWidthButton
}: WidgetPreviewProps) => {
  const containerBorder = borderWidthContainer ?? 1
  const messageBorder = borderWidthMessage ?? 0
  const buttonBorder = borderWidthButton ?? 1
  const accent = primaryColor || "rgb(37, 99, 235)"

  return (
    <div className="flex flex-col gap-4">
      {/* Collapsed toggle button preview */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-card shadow-lg"
          style={{
            borderWidth: containerBorder,
            borderColor: "var(--border)"
          }}
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt="Widget icon"
              className="h-5 w-5 rounded object-contain"
            />
          ) : (
            <Sparkles className="h-5 w-5" style={{ color: accent }} />
          )}
        </div>
        <span className="text-xs text-muted-foreground">Toggle button</span>
      </div>

      {/* Expanded panel preview */}
      <div
        className="flex flex-col overflow-hidden rounded-2xl border bg-card/80 shadow-xl backdrop-blur-sm"
        style={{
          borderWidth: containerBorder,
          borderColor: "var(--border)",
          backgroundColor: backgroundColor || undefined,
          color: textColor || undefined,
          maxHeight: 360
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-muted/50"
            style={{ borderWidth: containerBorder }}
          >
            {iconUrl ? (
              <img
                src={iconUrl}
                alt="Widget icon"
                className="h-4 w-4 rounded object-contain"
              />
            ) : (
              <Sparkles className="h-4 w-4" style={{ color: accent }} />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {STATIC_MESSAGES.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm font-medium">{emptyTitle}</p>
              <p className="text-xs text-muted-foreground">
                {emptyDescription}
              </p>
            </div>
          ) : (
            STATIC_MESSAGES.map((msg, idx) => (
              <div
                key={idx}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                  msg.role === "user"
                    ? "ml-auto bg-muted/60"
                    : "mr-auto bg-muted/30"
                }`}
                style={{
                  borderWidth: messageBorder,
                  borderStyle: messageBorder > 0 ? "solid" : "none",
                  borderColor: "var(--border)"
                }}
              >
                {msg.content}
              </div>
            ))
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border bg-background/60 p-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {inputPlaceholder}
            </div>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{
                backgroundColor: accent,
                borderWidth: buttonBorder,
                borderStyle: buttonBorder > 0 ? "solid" : "none",
                borderColor: accent
              }}
              disabled
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
