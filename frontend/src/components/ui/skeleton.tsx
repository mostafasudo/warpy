import { forwardRef, type HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

type SkeletonProps = HTMLAttributes<HTMLDivElement>

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
))

Skeleton.displayName = "Skeleton"
