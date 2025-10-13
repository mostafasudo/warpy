
import { ClerkProvider } from "@clerk/clerk-react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App"
import { configureApiClient } from "./api/client"
import "./index.css"

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!publishableKey) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required")
}

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000"
const apiTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? "5000")
if (Number.isNaN(apiTimeoutMs) || apiTimeoutMs <= 0) {
  throw new Error("VITE_API_TIMEOUT_MS must be a positive number")
}

configureApiClient({ apiUrl, apiTimeoutMs })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: 1,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: 0
    }
  }
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>
)
