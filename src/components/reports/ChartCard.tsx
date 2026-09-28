import { useState, type ReactNode } from 'react';
import { SegmentedControl } from '../shared/SegmentedControl';

export interface LegendItem {
  label: string;
  color: string;
  /** rect for bars, line for lines (the legend mirrors the mark). */
  shape: 'rect' | 'line';
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Always present for two or more series; omit for a single series (the title names it). */
  legend?: LegendItem[];
  chart: ReactNode;
  /** The table twin: every value the chart shows, readable without hovering. */
  table: ReactNode;
  footnote?: ReactNode;
}

type CardView = 'chart' | 'table';

const VIEW_OPTIONS = [{ value: 'chart' as const, label: 'Chart' }, { value: 'table' as const, label: 'Table' }];

/**
 * Card frame shared by every Reports chart: title/subtitle, a legend rendered
 * HERE (not by recharts) so every card places it identically, and the
 * Chart / Table toggle that is the accessibility twin of the chart.
 */
export function ChartCard({ title, subtitle, legend, chart, table, footnote }: ChartCardProps) {
  const [view, setView] = useState<CardView>('chart');
  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-3" aria-label={title}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-body-secondary">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted">{subtitle}</p>}
        </div>
        {legend && legend.length > 0 && (
          <ul className="flex flex-wrap items-center gap-3 text-[11px] text-muted" aria-label={`${title} legend`}>
            {legend.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={item.shape === 'line' ? 'inline-block w-3.5 h-0.5 rounded-full' : 'inline-block w-2.5 h-2.5 rounded-sm'}
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </li>
            ))}
          </ul>
        )}
        <div className="ml-auto">
          <SegmentedControl label={`${title} view`} options={VIEW_OPTIONS} value={view} onChange={setView} />
        </div>
      </div>
      {view === 'chart' ? chart : table}
      {footnote && <p className="mt-2 text-[11px] text-muted">{footnote}</p>}
    </section>
  );
}
