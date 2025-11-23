import { UserButton } from "@clerk/clerk-react"
import { type ReactNode } from "react"
import { Braces, Link2, Network } from "lucide-react"

import { BaseUrlsPanel } from "@/features/base-urls/base-urls-panel"
import { EndpointsPanel } from "@/features/endpoints/EndpointsPanel"
import { SessionHeadersPanel } from "@/features/session-headers/session-headers-panel"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { navigationSelectors, useNavigationStore } from "@/stores/navigation"

type NavButtonProps = {
  active: boolean
  label: string
  icon: ReactNode
  onClick: () => void
}

const NavButton = ({ active, label, icon, onClick }: NavButtonProps) => (
  <Button
    type="button"
    variant="ghost"
    onClick={onClick}
    aria-current={active ? "page" : undefined}
    className={cn(
      "flex w-full items-center justify-start gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
      active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
    )}
  >
    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted/60 text-foreground">
      {icon}
    </span>
    {label}
  </Button>
)

export const Shell = () => {
  const section = useNavigationStore(navigationSelectors.section)
  const setSection = useNavigationStore(navigationSelectors.setSection)

  return (
    <div className="flex">
      <aside className="hidden min-h-screen w-64 flex-shrink-0 border-r border-border/80 bg-card/70 px-4 py-6 md:block">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">API configurator</p>
            <p className="text-xs text-muted-foreground">Configure your API surface</p>
          </div>
        </div>
        <nav className="mt-8 flex flex-col gap-2">
          <NavButton
            active={section === "base"}
            label="Base URLs"
            icon={<Link2 className="h-4 w-4" />}
            onClick={() => setSection("base")}
          />
          <NavButton
            active={section === "headers"}
            label="Session Headers"
            icon={<Braces className="h-4 w-4" />}
            onClick={() => setSection("headers")}
          />
          <NavButton
            active={section === "endpoints"}
            label="Endpoints"
            icon={<Network className="h-4 w-4" />}
            onClick={() => setSection("endpoints")}
          />
        </nav>
      </aside>
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">API Surface</h1>
            <p className="text-sm text-muted-foreground">Manage environments, session headers, and endpoints.</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="rounded-full">
              <UserButton />
            </div>
          </div>
        </header>
        {section === "base" && <BaseUrlsPanel />}
        {section === "headers" && <SessionHeadersPanel />}
        {section === "endpoints" && <EndpointsPanel />}
      </div>
    </div>
  )
}
