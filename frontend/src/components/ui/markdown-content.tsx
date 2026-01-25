import Markdown from "react-markdown"
import { cn } from "@/lib/utils"

type MarkdownContentProps = {
  children: string
  className?: string
}

export const MarkdownContent = ({ children, className }: MarkdownContentProps) => {
  return (
    <div className={cn("markdown-content", className)}>
      <Markdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  )
}
