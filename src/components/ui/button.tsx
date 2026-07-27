import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ink)] text-white shadow-sm hover:-translate-y-px hover:bg-[#1d2522]",
        accent:
          "bg-[var(--accent)] text-[#102019] shadow-sm shadow-emerald-900/10 hover:-translate-y-px hover:bg-[#71ba90]",
        outline:
          "border border-[var(--border)] bg-white/72 text-[var(--ink)] hover:border-[#b9b7ad] hover:bg-white",
        ghost: "text-[var(--muted)] hover:bg-black/[0.045] hover:text-[var(--ink)]",
        soft: "bg-[var(--accent-soft)] text-[#2d6547] hover:bg-[#d9ecdf]",
        danger: "bg-red-50 text-red-700 hover:bg-red-100",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 px-5",
        icon: "size-9 p-0",
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
