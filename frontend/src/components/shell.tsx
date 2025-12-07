import { UserButton } from "@clerk/clerk-react"
import { type ReactNode, useEffect, useState } from "react"
import { Braces, LayoutDashboard, Network, PanelLeftClose, PanelLeftOpen, Smartphone, Sparkles } from "lucide-react"

import { ActionTooltip } from "@/components/action-tooltip"
import { AgentPanel } from "@/features/agent/agent-panel"
import { DashboardPanel } from "@/features/dashboard/dashboard-panel"
import { ApiConfigPanel } from "@/features/api-config/api-config-panel"
import { EndpointsPanel } from "@/features/endpoints/EndpointsPanel"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { navigationSelectors, useNavigationStore } from "@/stores/navigation"

type NavButtonProps = {
  active: boolean
  label: string
  icon: ReactNode
  onClick: () => void
  collapsed: boolean
}

const NavButton = ({ active, label, icon, onClick, collapsed }: NavButtonProps) => {
  const button = (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200",
        collapsed ? "justify-center gap-0" : "justify-start gap-3",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted/60 text-foreground">
        {icon}
      </span>
      <span
        className={cn(
          "whitespace-nowrap overflow-hidden transition-all duration-200",
          collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100"
        )}
      >
        {label}
      </span>
    </Button>
  )

  return collapsed ? (
    <ActionTooltip content={label} side="right">
      {button}
    </ActionTooltip>
  ) : (
    button
  )
}

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
          This dashboard works best on larger screens. Switch to your laptop or desktop to continue.
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
  const sidebarCollapsed = useNavigationStore(navigationSelectors.sidebarCollapsed)
  const setSection = useNavigationStore(navigationSelectors.setSection)
  const toggleSidebarCollapsed = useNavigationStore(navigationSelectors.toggleSidebarCollapsed)

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
        <aside
          className={cn(
            "hidden min-h-screen flex-shrink-0 flex-col border-r border-border/80 bg-card/70 py-6 transition-[width] duration-300 ease-out md:flex",
            sidebarCollapsed ? "w-20 px-2" : "w-64 px-4"
          )}
        >
          <div className={cn("flex items-center gap-3 px-2", sidebarCollapsed && "justify-center gap-0 px-0")}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Network className="h-5 w-5" />
            </div>
            <div
              className={cn(
                "overflow-hidden transition-all duration-200",
                sidebarCollapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"
              )}
            >
              <p className="text-sm font-semibold">Chat to API</p>
              <p className="text-xs text-muted-foreground">Configure your API surface and create features</p>
            </div>
          </div>
          <nav className="mt-8 flex flex-col gap-2">
            <NavButton
              active={section === "dashboard"}
              label="Dashboard"
              icon={<LayoutDashboard className="h-4 w-4" />}
              collapsed={sidebarCollapsed}
              onClick={() => setSection("dashboard")}
            />
            <NavButton
              active={section === "api"}
              label="API config"
              icon={<Braces className="h-4 w-4" />}
              collapsed={sidebarCollapsed}
              onClick={() => setSection("api")}
            />
            <NavButton
              active={section === "features"}
              label="Features"
              icon={<Network className="h-4 w-4" />}
              collapsed={sidebarCollapsed}
              onClick={() => setSection("features")}
            />
            <NavButton
              active={section === "agent"}
              label="Agent"
              icon={<Sparkles className="h-4 w-4" />}
              collapsed={sidebarCollapsed}
              onClick={() => setSection("agent")}
            />
          </nav>
          <div className="mt-auto pt-8">
            <NavButton
              active={false}
              label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              icon={sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              collapsed={sidebarCollapsed}
              onClick={toggleSidebarCollapsed}
            />
          </div>
        </aside>
        <div className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {section === "dashboard"
                  ? "API configuration"
                  : section === "api"
                    ? "API config"
                    : section === "features"
                      ? "Features"
                      : "Agent"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {section === "dashboard"
                  ? "See setup progress and jump to what matters next."
                  : section === "api"
                    ? "Configure base URLs and session headers for every request."
                    : section === "features"
                      ? "Create endpoints to empower your agent with features."
                      : "Publish your agent."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="rounded-full">
                <UserButton />
              </div>
            </div>
          </header>
          {section === "dashboard" && <DashboardPanel />}
          {section === "api" && <ApiConfigPanel />}
          {section === "features" && <EndpointsPanel />}
          {section === "agent" && <AgentPanel />}
        </div>
      </div>
      {isMobile && <MobileGuard />}
    </div>
  )
}
