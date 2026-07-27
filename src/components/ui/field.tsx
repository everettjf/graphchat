import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]" {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-[var(--border)] bg-white/75 px-3.5 text-sm text-[var(--ink)] outline-none transition placeholder:text-[#aaa99f] focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent)]/10",
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
        "w-full resize-none rounded-2xl border border-[var(--border)] bg-white/82 px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition placeholder:text-[#aaa99f] focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent)]/10",
        className,
      )}
      {...props}
    />
  );
}
