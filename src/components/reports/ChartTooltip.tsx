import type { ReactNode } from 'react';

/** Tooltip surface, styled like the shared Tooltip component. */
export function ChartTooltipFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-elevated shadow-lg px-3 py-2 text-[11px] min-w-40">
      <p className="font-semibold text-heading mb-1">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/** Value first (strong), label second (muted), optional line key in the series color. Text never wears the series color. */
export function ChartTooltipRow({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-semibold text-heading tabular-nums">{value}</span>
      <span className="text-muted inline-flex items-center gap-1.5">
        {color && <span aria-hidden data-tooltip-key className="inline-block w-3 h-0.5 rounded-full" style={{ backgroundColor: color }} />}
        {label}
      </span>
    </div>
  );
}
