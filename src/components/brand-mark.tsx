export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
        <i />
      </div>
      {!compact && (
        <div className="font-display text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
          Graph Chat
        </div>
      )}
    </div>
  );
}
