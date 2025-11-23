import { type ReactElement } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type ActionTooltipProps = {
  content: string
  side?: "top" | "bottom" | "left" | "right"
  children: ReactElement
}

export const ActionTooltip = ({ content, side = "top", children }: ActionTooltipProps) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side={side}>{content}</TooltipContent>
  </Tooltip>
)
