import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]"
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] shadow-[var(--shadow-xs)] outline-none transition placeholder:text-[var(--muted-light)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent-ring)]",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-sm leading-6 text-[var(--ink)] shadow-[var(--shadow-xs)] outline-none transition placeholder:text-[var(--muted-light)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent-ring)]",
        className,
      )}
      {...props}
    />
  );
}
