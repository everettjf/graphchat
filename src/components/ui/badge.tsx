import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-medium tracking-[0.01em] text-[var(--muted)]",
        className,
      )}
      {...props}
    />
  );
}
