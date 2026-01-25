import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/clerk-react"
import { LayoutDashboard, Network, Sparkles } from "lucide-react"
import { type ReactNode } from "react"

import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const highlights = [
  {
    icon: LayoutDashboard,
    title: "Configure your dashboard",
    description: "Manage agents, API config, and endpoints in one place."
  },
  {
    icon: Network,
    title: "Embed anywhere",
    description: "Drop the widget script into your dashboard to go live."
  },
  {
    icon: Sparkles,
    title: "Jarvis for your dashboard",
    description: "Turn intent into authenticated UI and API actions."
  }
] as const

export const SignedOutCard = () => (
  <SignedOut>
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-muted/40" />
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-44 -left-44 h-96 w-96 rounded-full bg-muted/50 blur-3xl" />
        <div className="absolute -bottom-44 -right-44 h-96 w-96 rounded-full bg-secondary/30 blur-3xl" />
      </div>
      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-10 md:flex-row md:justify-between">
        <div className="hidden w-full max-w-xl flex-col gap-6 md:flex">
          <div className="space-y-3">
            <Badge variant="secondary" className="w-fit">
              Jarvis for your dashboard.
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight">Warpy</h1>
            <p className="max-w-md text-muted-foreground">
              Embeddable agent widget for dashboards. Turn intent into authenticated UI and API actions.
            </p>
          </div>
          <div className="grid gap-4">
            {highlights.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-muted/60 text-foreground">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{title}</p>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-border bg-card/75 p-8 shadow-sm backdrop-blur">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-xl font-semibold md:hidden">Warpy</h1>
              <h1 className="hidden text-xl font-semibold md:block">Sign in</h1>
              <p className="text-sm text-muted-foreground md:hidden">Jarvis for your dashboard.</p>
              <p className="hidden text-sm text-muted-foreground md:block">Continue to your Warpy dashboard.</p>
            </div>
            <ThemeToggle />
          </div>
          <div className="flex flex-col gap-3">
            <SignInButton mode="modal">
              <Button className="w-full" size="sm">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button className="w-full" size="sm" variant="outline">
                Create account
              </Button>
            </SignUpButton>
          </div>
        </div>
      </div>
    </div>
  </SignedOut>
)

type SignedInBoundaryProps = {
  children: ReactNode
}

export const SignedInBoundary = ({ children }: SignedInBoundaryProps) => <SignedIn>{children}</SignedIn>
