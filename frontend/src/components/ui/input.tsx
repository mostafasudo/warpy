import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  suffix?: React.ReactNode
  wrapperClassName?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, wrapperClassName, type = "text", suffix, ...props }, ref) => (
    <div className={cn("relative flex items-center", wrapperClassName)}>
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm ring-offset-background",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
      {suffix ? <div className="absolute right-3 flex items-center text-muted-foreground">{suffix}</div> : null}
    </div>
  )
)
Input.displayName = "Input"

export { Input }
