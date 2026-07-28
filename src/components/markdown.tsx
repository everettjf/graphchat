import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
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
            codeClassName === "language-mermaid" ? (
              <MermaidDiagram chart={String(codeChildren).trim()} />
            ) : (
              <code className={codeClassName} {...props}>
                {codeChildren}
              </code>
            )
          ),
          pre: ({ children: preChildren }) => {
            const child = Children.only(preChildren) as ReactNode;
            if (isValidElement(child) && child.type === MermaidDiagram) return child;
            return <pre>{preChildren}</pre>;
          },
          table: (props: ComponentProps<"table">) => (
            <div className="markdown-table-scroll" tabIndex={0}>
              <table {...props} />
            </div>
          ),
          blockquote: (props: ComponentProps<"blockquote">) => <blockquote {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

let mermaidInitialized = false;

function MermaidDiagram({ chart }: { chart: string }) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const render = async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "neutral",
            flowchart: { curve: "basis", htmlLabels: false },
          });
          mermaidInitialized = true;
        }
        const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
        const rendered = await mermaid.render(id, chart);
        if (active) setSvg(rendered.svg);
      } catch (renderError) {
        if (active) {
          setError(
            renderError instanceof Error
              ? renderError.message
              : "Unable to render this diagram.",
          );
        }
      }
    };
    void render();
    return () => {
      active = false;
    };
  }, [chart, reactId]);

  if (error) {
    return (
      <div className="mermaid-error">
        <strong>Diagram could not be rendered</strong>
        <span>{error}</span>
        <code>{chart}</code>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="mermaid-diagram" aria-label="Mermaid diagram">
        <span>Rendering diagram…</span>
      </div>
    );
  }

  return (
    <div
      className="mermaid-diagram"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
