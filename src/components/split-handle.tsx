import { ChevronLeft, ChevronRight, Equal } from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export function SplitHandle({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const { locale } = useI18n();

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const move = (pointer: PointerEvent) => {
      const percentage = ((pointer.clientX - rect.left) / rect.width) * 100;
      onChange(Math.min(75, Math.max(30, Math.round(percentage * 10) / 10)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  return (
    <div
      role="separator"
      aria-label={locale.startsWith("zh") ? "调整聊天和知识树宽度" : "Resize conversation and knowledge tree"}
      aria-valuemin={30}
      aria-valuemax={75}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      className="group relative z-30 hidden w-2 shrink-0 cursor-col-resize bg-[var(--border)]/55 outline-none transition hover:bg-[var(--border-strong)] focus-visible:bg-[var(--accent)] md:block"
      onPointerDown={startDrag}
      onDoubleClick={() => onChange(50)}
      onKeyDown={(event) => {
        if (!event.altKey) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onChange(Math.max(30, value - 5));
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onChange(Math.min(75, value + 5));
        }
      }}
    >
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 opacity-0 shadow-[var(--shadow-lg)] transition group-hover:opacity-100 group-focus-within:opacity-100">
        <PresetButton
          label={locale.startsWith("zh") ? "内容优先 70:30" : "Conversation focus 70:30"}
          active={value === 70}
          onClick={() => onChange(70)}
        >
          <ChevronRight className="size-3" />
        </PresetButton>
        <PresetButton
          label={locale.startsWith("zh") ? "平均 50:50" : "Balanced 50:50"}
          active={value === 50}
          onClick={() => onChange(50)}
        >
          <Equal className="size-3" />
        </PresetButton>
        <PresetButton
          label={locale.startsWith("zh") ? "知识树优先 35:65" : "Tree focus 35:65"}
          active={value === 35}
          onClick={() => onChange(35)}
        >
          <ChevronLeft className="size-3" />
        </PresetButton>
      </div>
    </div>
  );
}

function PresetButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "grid size-7 cursor-pointer place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover)]",
        active && "bg-[var(--accent-soft)] text-[var(--accent-fg)]",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
