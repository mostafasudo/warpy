import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { widgetStylesDefault, type WidgetStyles } from "@/types/widget-styles"

type EditorProps = {
  styles: WidgetStyles
  onChange: (next: WidgetStyles) => void
}

export const ColorsEditor = ({ styles, onChange }: EditorProps) => {
  const setColors = (updates: Partial<WidgetStyles["colors"]>) =>
    onChange({ ...styles, colors: { ...styles.colors, ...updates } })
  const reset = () => onChange({ ...styles, colors: widgetStylesDefault.colors })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Colors</h4>
        <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
          Reset section
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["Primary", "primary"],
          ["Background", "background"],
          ["Surface", "surface"],
          ["Text", "text"],
          ["Text muted", "textMuted"],
          ["Border", "border"]
        ] as const).map(([label, key]) => (
          <div key={key} className="space-y-2">
            <Label className="text-xs">{label}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={styles.colors[key]}
                onChange={(event) => setColors({ [key]: event.target.value })}
                className="h-9 w-12 p-1"
              />
              <Input
                value={styles.colors[key]}
                onChange={(event) => setColors({ [key]: event.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const SpacingEditor = ({ styles, onChange }: EditorProps) => {
  const setSpacing = (updates: Partial<WidgetStyles["spacing"]>) =>
    onChange({ ...styles, spacing: { ...styles.spacing, ...updates } })
  const reset = () => onChange({ ...styles, spacing: widgetStylesDefault.spacing })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Spacing</h4>
        <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
          Reset section
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["Container padding", "containerPadding"],
          ["Message padding", "messagePadding"],
          ["Input padding", "inputPadding"],
          ["Message gap", "messageGap"],
          ["Section gap", "sectionGap"]
        ] as const).map(([label, key]) => (
          <div key={key} className="space-y-2">
            <Label className="text-xs">{label}</Label>
            <Input
              type="number"
              value={styles.spacing[key]}
              onChange={(event) => setSpacing({ [key]: Number(event.target.value) })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export const BordersEditor = ({ styles, onChange }: EditorProps) => {
  const setBorders = (updates: Partial<WidgetStyles["borders"]>) =>
    onChange({ ...styles, borders: { ...styles.borders, ...updates } })
  const reset = () => onChange({ ...styles, borders: widgetStylesDefault.borders })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Borders</h4>
        <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
          Reset section
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["Container width", "containerWidth"],
          ["Container radius", "containerRadius"],
          ["Message width", "messageWidth"],
          ["Message radius", "messageRadius"],
          ["Button width", "buttonWidth"],
          ["Button radius", "buttonRadius"],
          ["Input width", "inputWidth"],
          ["Input radius", "inputRadius"]
        ] as const).map(([label, key]) => (
          <div key={key} className="space-y-2">
            <Label className="text-xs">{label}</Label>
            <Input
              type="number"
              value={styles.borders[key]}
              onChange={(event) => setBorders({ [key]: Number(event.target.value) })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export const TypographyEditor = ({ styles, onChange }: EditorProps) => {
  const setTypography = (updates: Partial<WidgetStyles["typography"]>) =>
    onChange({ ...styles, typography: { ...styles.typography, ...updates } })
  const reset = () => onChange({ ...styles, typography: widgetStylesDefault.typography })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Typography</h4>
        <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
          Reset section
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label className="text-xs">Font family</Label>
          <Input
            value={styles.typography.fontFamily}
            onChange={(event) => setTypography({ fontFamily: event.target.value })}
          />
        </div>
        {([
          ["Font size base", "fontSizeBase"],
          ["Font size small", "fontSizeSmall"],
          ["Font size large", "fontSizeLarge"],
          ["Font weight normal", "fontWeightNormal"],
          ["Font weight medium", "fontWeightMedium"],
          ["Font weight bold", "fontWeightBold"]
        ] as const).map(([label, key]) => (
          <div key={key} className="space-y-2">
            <Label className="text-xs">{label}</Label>
            <Input
              type="number"
              value={styles.typography[key]}
              onChange={(event) => setTypography({ [key]: Number(event.target.value) })}
            />
          </div>
        ))}
        <div className="space-y-2">
          <Label className="text-xs">Line height</Label>
          <Input
            type="number"
            step="0.1"
            value={styles.typography.lineHeight}
            onChange={(event) => setTypography({ lineHeight: Number(event.target.value) })}
          />
        </div>
      </div>
    </div>
  )
}

export const ShadowsEditor = ({ styles, onChange }: EditorProps) => {
  const setShadows = (updates: Partial<WidgetStyles["shadows"]>) =>
    onChange({ ...styles, shadows: { ...styles.shadows, ...updates } })
  const reset = () => onChange({ ...styles, shadows: widgetStylesDefault.shadows })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Shadows</h4>
        <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
          Reset section
        </Button>
      </div>
      <div className="grid gap-3">
        {([
          ["Widget shadow", "widget"],
          ["Message shadow", "message"],
          ["Button shadow", "button"]
        ] as const).map(([label, key]) => (
          <div key={key} className="space-y-2">
            <Label className="text-xs">{label}</Label>
            <Input
              value={styles.shadows[key]}
              onChange={(event) => setShadows({ [key]: event.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

