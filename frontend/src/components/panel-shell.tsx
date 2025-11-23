import { type ReactNode } from "react"

type PanelShellProps = {
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
}

export const PanelShell = ({ title, description, action, children }: PanelShellProps) => (
  <section className="rounded-2xl border border-border bg-card/70 p-6 shadow-sm">
    <div className="mb-4 flex items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
    {children}
  </section>
)
