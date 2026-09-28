interface KpiTileProps {
  label: string;
  value: string;
  caption?: string;
  /** The single hero figure of a view (48px). Exactly one per view. */
  hero?: boolean;
}

/** Stat tile: label, value, caption. Proportional figures on purpose (no tabular-nums at display sizes). */
export function KpiTile({ label, value, caption, hero }: KpiTileProps) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 flex flex-col gap-1 min-w-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</span>
      <span className={`${hero ? 'text-5xl' : 'text-2xl'} font-semibold text-heading leading-none truncate`}>{value}</span>
      {caption && <span className="text-[11px] text-muted">{caption}</span>}
    </div>
  );
}
