import { SignedInApp } from "@/components/signed-in-app"
import { SignedInBoundary, SignedOutCard } from "@/components/signed-out-card"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ToastContainer } from "@/components/toast-container"

function App() {
  return (
    <TooltipProvider delayDuration={150}>
      <main className="min-h-screen bg-background text-foreground">
        <SignedOutCard />
        <SignedInBoundary>
          <SignedInApp />
        </SignedInBoundary>
      </main>
      <ToastContainer />
    </TooltipProvider>
  )
}

export default App
