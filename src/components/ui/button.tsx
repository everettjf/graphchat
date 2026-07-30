import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--paper)] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[var(--shadow-xs)] hover:bg-[var(--accent-strong)]",
        accent:
          "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[var(--shadow-xs)] hover:bg-[var(--accent-strong)]",
        outline:
          "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-xs)] hover:bg-[var(--hover)]",
        ghost: "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
        soft: "bg-[var(--accent-soft)] text-[var(--accent-fg)] hover:bg-[var(--paper-deep)]",
        danger:
          "bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger-soft)_85%,var(--danger))]",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-7 rounded-md px-2.5 text-xs",
        lg: "h-11 px-5",
        icon: "size-8 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
