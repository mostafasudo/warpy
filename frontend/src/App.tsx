import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/clerk-react"

import { Button } from "@/components/ui/button"
import { useHealthQuery } from "@/queries/use-health"
import { counterSelectors, useCounterStore } from "@/stores/counter"

export function Dashboard() {
  const count = useCounterStore(counterSelectors.value)
  const increment = useCounterStore(counterSelectors.increment)
  const reset = useCounterStore(counterSelectors.reset)
  const { data, error, isPending, refetch, isFetching } = useHealthQuery()
  const errorMessage = error instanceof Error ? error.message : null
  const healthLabel = errorMessage ?? (isPending ? "loading" : data?.status ?? "unknown")

  return (
    <div className="flex w-full max-w-md flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-sm">
      <header className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold leading-none tracking-tight">Starter Dashboard</h1>
          <p className="text-sm text-muted-foreground">React Query, Clerk, and Zustand ready to go.</p>
        </div>
        <UserButton />
      </header>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">API health</h2>
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
          <span data-testid="health-status" className="text-sm font-medium capitalize text-primary">
            {healthLabel}
          </span>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            Refresh
          </Button>
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Local counter</h2>
        <div className="flex items-center justify-between">
          <span data-testid="counter-value" className="text-3xl font-bold tracking-tight">
            {count}
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={increment}>
              Increment
            </Button>
            <Button size="sm" variant="secondary" onClick={reset}>
              Reset
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

export function AuthPrompt() {
  return (
    <div className="flex w-full max-w-md flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-sm">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold leading-none tracking-tight">Welcome</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to access the dashboard and manage your projects.
        </p>
      </header>
      <div className="flex flex-col gap-2">
        <SignInButton mode="modal">
          <Button size="sm">Sign in</Button>
        </SignInButton>
        <SignUpButton mode="modal">
          <Button size="sm" variant="outline">
            Create account
          </Button>
        </SignUpButton>
      </div>
    </div>
  )
}

function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <SignedOut>
        <AuthPrompt />
      </SignedOut>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </main>
  )
}

export default App
