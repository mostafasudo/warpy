import { UserButton } from "@clerk/clerk-react"
import { type ReactNode, useEffect, useState } from "react"
import { Braces, Link2, Network, Smartphone } from "lucide-react"

import { BaseUrlsPanel } from "@/features/base-urls/base-urls-panel"
import { EndpointsPanel } from "@/features/endpoints/EndpointsPanel"
import { SessionHeadersPanel } from "@/features/session-headers/session-headers-panel"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useHealthQuery } from "@/queries/use-health"
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

const MobileGuard = () => (
  <div
    data-testid="mobile-guard"
    className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 px-6 backdrop-blur-lg md:hidden"
  >
    <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card/90 p-6 text-center shadow-lg">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground">
        <Smartphone className="h-5 w-5" />
      </div>
      <div className="space-y-2">
        <p className="text-lg font-semibold">Use a larger screen</p>
        <p className="text-sm text-muted-foreground">
          The dashboard is optimized for laptops and desktops. Continue there to configure environments, headers, and
          endpoints.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">You will stay signed in on this device.</p>
    </div>
  </div>
)

export const Shell = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return false
    return window.matchMedia("(max-width: 767px)").matches
  })
  const section = useNavigationStore(navigationSelectors.section)
  const setSection = useNavigationStore(navigationSelectors.setSection)
  const { data: health } = useHealthQuery()
  const isHealthy = (health?.status ?? "").toLowerCase() === "ok"

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return
    const media = window.matchMedia("(max-width: 767px)")
    const update = () => setIsMobile(media.matches)
    update()
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update)
      return () => media.removeEventListener("change", update)
    }
    if (typeof media.addListener === "function") {
      media.addListener(update)
      return () => media.removeListener(update)
    }
  }, [])

  return (
    <div className="relative min-h-screen">
      <div className={cn("flex", isMobile && "pointer-events-none opacity-50 blur-sm")}>
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
              <Badge variant={isHealthy ? "secondary" : "outline"} className="gap-2">
                <span className={cn("h-2 w-2 rounded-full", isHealthy ? "bg-primary" : "bg-muted-foreground")} />
                {isHealthy ? "ok" : health?.status ?? "checking"}
              </Badge>
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
      {isMobile && <MobileGuard />}
    </div>
  )
}
