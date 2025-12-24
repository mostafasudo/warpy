import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/clerk-react"
import { type ReactNode } from "react"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

export const SignedOutCard = () => (
  <SignedOut>
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/70 p-8 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Warpy</h1>
            <p className="text-sm text-muted-foreground">Bend the Interface.</p>
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
  </SignedOut>
)

type SignedInBoundaryProps = {
  children: ReactNode
}

export const SignedInBoundary = ({ children }: SignedInBoundaryProps) => <SignedIn>{children}</SignedIn>
