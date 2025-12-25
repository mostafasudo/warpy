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

const sectionQueryKey = "tab"
type Section = ReturnType<typeof navigationSelectors.section>
const navigationSections: Section[] = ["dashboard", "api", "features", "agent"]

const getSectionFromUrl = (): Section | null => {
  if (typeof window === "undefined") return null
  const value = new URLSearchParams(window.location.search).get(sectionQueryKey)
  if (!value) return null
  return navigationSections.includes(value as Section) ? (value as Section) : null
}

const syncSectionToUrl = (section: Section) => {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (section === "dashboard") {
    url.searchParams.delete(sectionQueryKey)
  } else {
    url.searchParams.set(sectionQueryKey, section)
  }
  window.history.replaceState(null, "", url.toString())
}

const NavButton = ({ active, label, icon, onClick, collapsed }: NavButtonProps) => {
  const button = (
    <Button
      type="button"
      variant="ghost"
      onClick={(event) => {
        onClick()
        if (event.detail > 0) {
          event.currentTarget.blur()
        }
      }}
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
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia("(max-width: 767px)").matches
  })
  const [hasSyncedSection, setHasSyncedSection] = useState(false)
  const section = useNavigationStore(navigationSelectors.section)
  const sidebarCollapsed = useNavigationStore(navigationSelectors.sidebarCollapsed)
  const setSection = useNavigationStore(navigationSelectors.setSection)
  const toggleSidebarCollapsed = useNavigationStore(navigationSelectors.toggleSidebarCollapsed)

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
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

  useEffect(() => {
    const sectionFromUrl = getSectionFromUrl()
    if (sectionFromUrl) {
      setSection(sectionFromUrl)
    }
    setHasSyncedSection(true)
  }, [setSection])

  useEffect(() => {
    if (!hasSyncedSection) return
    syncSectionToUrl(section)
  }, [hasSyncedSection, section])

  return (
    <div className="relative min-h-screen">
      <div className={cn("flex", isMobile && "pointer-events-none opacity-50 blur-sm")}>
        <aside
          className={cn(
            "hidden flex-shrink-0 flex-col border-r border-border/80 bg-card/70 py-6 transition-[width] duration-300 ease-out md:sticky md:top-0 md:h-screen md:max-h-screen md:flex",
            sidebarCollapsed ? "w-20 px-2" : "w-64 px-4"
          )}
        >
          <div className={cn("flex items-center gap-3 px-2", sidebarCollapsed && "justify-center gap-0 px-0")}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              version="1.1"
              viewBox="0 0 1080 1030"
              className="h-10 w-10 text-foreground"
              fill="currentColor"
            >
              <g fill="none" strokeLinecap="butt" />
              <path
                fill="currentColor"
                d="M 130.00 228.00 L 228.00 228.00 C 231.10 234.97 236.05 248.25 241.00 262.00 C 245.95 275.75 254.95 300.95 261.00 318.00 C 267.05 335.05 274.25 354.62 277.00 361.50 C 279.75 368.38 288.07 391.10 295.50 412.00 C 302.93 432.90 311.48 456.75 314.50 465.00 C 317.52 473.25 321.57 484.05 323.50 489.00 C 325.43 493.95 334.88 519.83 344.50 546.50 C 354.12 573.17 362.23 595.90 362.50 597.00 C 362.99 598.98 362.50 599.00 317.00 599.00 L 271.00 599.00 C 264.02 580.40 257.50 563.30 252.00 549.00 C 246.50 534.70 237.72 511.52 232.50 497.50 C 227.28 483.48 220.97 467.05 218.50 461.00 C 216.03 454.95 208.82 436.27 202.50 419.50 C 196.18 402.73 188.30 381.80 185.00 373.00 C 181.70 364.20 176.97 352.05 174.50 346.00 C 172.03 339.95 167.75 329.15 165.00 322.00 C 162.25 314.85 153.25 290.77 145.00 268.50 L 130.00 228.00 Z"
                fillRule="evenodd"
              />
              <path
                fill="currentColor"
                d="M 855.00 228.00 C 930.17 228.00 952.23 228.22 952.50 228.50 C 952.77 228.78 951.65 232.38 950.00 236.50 C 948.35 240.62 944.08 251.88 940.50 261.50 C 936.92 271.12 928.60 293.18 922.00 310.50 C 915.40 327.82 907.52 348.07 904.50 355.50 C 901.48 362.93 892.25 387.23 884.00 409.50 C 875.75 431.77 868.55 450.45 868.00 451.00 C 867.45 451.55 864.98 452.23 862.50 452.50 C 860.02 452.77 851.25 454.57 843.00 456.50 C 834.75 458.43 815.85 462.48 801.00 465.50 C 786.15 468.52 772.42 471.23 770.50 471.50 C 767.83 471.88 767.00 471.64 767.00 470.50 C 767.00 469.68 767.67 467.43 768.50 465.50 C 769.33 463.57 772.92 453.68 776.50 443.50 C 780.08 433.32 787.05 413.75 792.00 400.00 C 796.95 386.25 801.67 373.43 802.50 371.50 C 803.33 369.57 807.15 359.23 811.00 348.50 C 814.85 337.77 820.92 320.68 824.50 310.50 C 828.08 300.32 834.38 282.77 838.50 271.50 C 842.62 260.23 848.02 245.82 850.50 239.50 L 855.00 228.00 Z"
                fillRule="evenodd"
              />
              <path
                fill="currentColor"
                d="M 489.00 334.00 C 568.00 334.00 585.18 334.35 585.50 335.00 C 585.77 335.55 588.02 341.62 590.50 348.50 C 592.98 355.38 601.30 379.23 609.00 401.50 C 616.70 423.77 625.48 449.20 628.50 458.00 C 631.52 466.80 634.90 476.25 636.00 479.00 C 637.10 481.75 647.00 509.88 658.00 541.50 C 669.00 573.12 679.58 603.05 681.50 608.00 C 683.42 612.95 688.60 627.35 693.00 640.00 C 697.40 652.65 705.50 676.05 711.00 692.00 C 716.50 707.95 722.80 725.73 725.00 731.50 C 727.20 737.27 734.40 757.52 741.00 776.50 C 747.60 795.48 753.90 813.48 755.00 816.50 C 756.10 819.52 757.00 822.67 757.00 823.50 C 757.00 824.81 751.00 825.00 709.00 825.00 C 662.00 825.00 660.98 824.96 660.00 823.00 C 659.45 821.90 655.62 811.10 651.50 799.00 C 647.38 786.90 639.95 765.52 635.00 751.50 C 630.05 737.48 624.65 722.40 623.00 718.00 C 621.35 713.60 616.40 699.65 612.00 687.00 C 607.60 674.35 599.73 651.62 594.50 636.50 C 589.27 621.38 582.98 603.60 580.50 597.00 C 578.02 590.40 569.02 564.75 560.50 540.00 C 551.98 515.25 542.52 488.02 539.50 479.50 C 536.48 470.98 529.95 452.52 525.00 438.50 C 520.05 424.48 509.93 395.23 502.50 373.50 L 489.00 334.00 Z"
                fillRule="evenodd"
              />
              <path
                fill="currentColor"
                d="M 425.00 554.00 C 456.00 569.50 469.05 576.25 474.00 579.00 C 478.95 581.75 487.50 586.25 493.00 589.00 C 498.50 591.75 503.23 594.45 503.50 595.00 C 503.77 595.55 502.20 600.73 500.00 606.50 C 497.80 612.27 489.48 635.90 481.50 659.00 C 473.52 682.10 464.52 707.75 461.50 716.00 C 458.48 724.25 451.50 743.83 446.00 759.50 C 440.50 775.17 433.30 795.88 430.00 805.50 C 426.70 815.12 423.55 823.45 423.00 824.00 C 422.36 824.64 404.83 825.00 374.50 825.00 C 343.83 825.00 326.82 824.65 326.50 824.00 C 326.23 823.45 328.25 817.15 331.00 810.00 C 333.75 802.85 339.82 786.65 344.50 774.00 C 349.18 761.35 354.57 746.95 356.50 742.00 C 358.43 737.05 362.70 725.58 366.00 716.50 C 369.30 707.42 375.60 690.10 380.00 678.00 C 384.40 665.90 390.02 650.60 392.50 644.00 C 394.98 637.40 397.68 630.42 398.50 628.50 C 399.32 626.58 403.82 614.42 408.50 601.50 C 413.18 588.58 418.80 572.60 421.00 566.00 L 425.00 554.00 Z"
                fillRule="evenodd"
              />
            </svg>
            <div
              className={cn(
                "overflow-hidden transition-all duration-200",
                sidebarCollapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"
              )}
            >
              <p className="text-sm font-semibold">Warpy</p>
              <p className="text-xs text-muted-foreground">Bend the Interface.</p>
            </div>
          </div>
	          <nav className="mt-8 flex flex-col gap-2">
	            <NavButton
	              active={section === "dashboard"}
	              label="Overview"
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
