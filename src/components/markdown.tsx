import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("markdown-body", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a target="_blank" rel="noreferrer" {...props} />,
          code: ({ className: codeClassName, children: codeChildren, ...props }) => (
            <code className={codeClassName} {...props}>
              {codeChildren}
            </code>
          ),
          blockquote: (props: ComponentProps<"blockquote">) => <blockquote {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
