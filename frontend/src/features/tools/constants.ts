import { type HttpMethod } from "@/types"

export const toolNamePattern = /^[a-zA-Z0-9_-]{1,64}$/

export const methodTone: Record<HttpMethod, string> = {
  GET: "border-primary/40 bg-primary/15 text-primary",
  POST: "border-secondary bg-secondary text-secondary-foreground",
  PUT: "border-accent bg-accent text-accent-foreground",
  PATCH: "border-muted bg-muted text-foreground",
  DELETE: "border-destructive/40 bg-destructive/15 text-destructive"
}

export const frontendTone = "tool-tag-frontend"
