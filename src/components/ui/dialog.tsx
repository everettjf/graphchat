import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  const { t } = useI18n();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#101418]/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-6 shadow-[var(--shadow-lg)] outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 grid size-7 place-items-center rounded-md text-[var(--muted-light)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          aria-label={t("dialog.close")}
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader(props: ComponentProps<"div">) {
  return <div className="mb-5 space-y-1.5 pr-8" {...props} />;
}

export function DialogTitle(props: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className="font-display text-xl font-semibold text-[var(--ink)]"
      {...props}
    />
  );
}

export function DialogDescription(
  props: ComponentProps<typeof DialogPrimitive.Description>,
) {
  return (
    <DialogPrimitive.Description
      className="text-[13px] leading-6 text-[var(--muted)]"
      {...props}
    />
  );
}
