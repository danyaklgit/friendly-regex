import { useCallback, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea } from 'recharts';
import type { CoverageDatum } from '../../utils/reports/aggregate';
import { TAGGED_COLOR, UNTAGGED_COLOR } from '../../utils/reports/feedSlots';
import { formatCount, formatRate } from '../../utils/reports/format';
import { ChartCard, type LegendItem } from './ChartCard';
import { ChartTooltipFrame, ChartTooltipRow } from './ChartTooltip';
import { activeRow, type TooltipRenderProps } from './activeRow';

/** Shared by chart 1 and chart 2 so hovering one highlights the same period in the other. */
export const REPORTS_SYNC_ID = 'tep-reports';

const LEGEND: LegendItem[] = [
  { label: 'Tagged', color: TAGGED_COLOR, shape: 'rect' },
  { label: 'Untagged', color: UNTAGGED_COLOR, shape: 'rect' },
];

const TICK = { fontSize: 10, fill: 'var(--color-muted)' };
// Hoisted so recharts sees a stable prop identity across re-renders it has no
// layout reason to react to (TagSpecContext's 1.5s poll re-renders ReportsTab
// while a tagging job runs); a fresh object every render forces a relayout.
const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };
const AXIS_LINE = { stroke: 'var(--color-border)' };
const CURSOR = { fill: 'var(--color-surface-hover)' };

interface CoverageColumnsChartProps {
  data: CoverageDatum[];
  selectedPeriod: string | null;
  onSelectPeriod: (periodStart: string) => void;
  /** One feed selected: the rate is the backend's own value; several: the summed rate. */
  singleFeed: boolean;
}

function CoverageTooltip(props: TooltipRenderProps) {
  const row = activeRow<CoverageDatum>(props);
  if (!row) return null;
  return (
    <ChartTooltipFrame title={row.title}>
      <ChartTooltipRow value={formatCount(row.tagged)} label="Tagged" color={TAGGED_COLOR} />
      <ChartTooltipRow value={formatCount(row.untagged)} label="Untagged" color={UNTAGGED_COLOR} />
      <ChartTooltipRow value={formatCount(row.total)} label="Total" />
      <ChartTooltipRow value={formatRate(row.rate, 2)} label="Tagging rate" />
    </ChartTooltipFrame>
  );
}

/**
 * Chart 1: stacked columns per business period. Untagged sits on the
 * BASELINE on purpose (it is the number operators act on and a baseline
 * segment is the only one readable exactly); Tagged stacks on top with the
 * rounded cap. The surface-colored 1px stroke reads as the 2px gap between
 * segments and neighbours. Clicking a column selects its period (recharts
 * hands the x value as `activeLabel`); a click on empty space has none.
 */
export function CoverageColumnsChart({ data, selectedPeriod, onSelectPeriod, singleFeed }: CoverageColumnsChartProps) {
  const axisLabel = useMemo(() => {
    const labels = new Map(data.map((d) => [d.periodStart, d.axisLabel]));
    return (periodStart: string) => labels.get(periodStart) ?? periodStart;
  }, [data]);
  const handleClick = useCallback((state: { activeLabel?: unknown } | null | undefined) => {
    const label = state?.activeLabel;
    if (typeof label === 'string' && label) onSelectPeriod(label);
  }, [onSelectPeriod]);

  const chart = (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} syncId={REPORTS_SYNC_ID} syncMethod="value" onClick={handleClick} margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
        <XAxis dataKey="periodStart" tickFormatter={axisLabel} interval="preserveStartEnd" minTickGap={24} tick={TICK} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis width="auto" tickFormatter={formatCount} tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={CoverageTooltip} cursor={CURSOR} isAnimationActive={false} />
        {selectedPeriod && <ReferenceArea x1={selectedPeriod} x2={selectedPeriod} fill="var(--color-primary)" fillOpacity={0.08} ifOverflow="hidden" />}
        <Bar dataKey="untagged" name="Untagged" stackId="coverage" fill={UNTAGGED_COLOR} stroke="var(--color-surface)" strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
        <Bar dataKey="tagged" name="Tagged" stackId="coverage" fill={TAGGED_COLOR} stroke="var(--color-surface)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );

  const table = useMemo(() => (
    <div className="max-h-80 overflow-auto custom-scrollbar">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-[10px] uppercase tracking-wide text-faint">
            <th className="py-1 pr-3 font-semibold">Period</th>
            <th className="py-1 pr-3 font-semibold text-right">Transactions</th>
            <th className="py-1 pr-3 font-semibold text-right">Tagged</th>
            <th className="py-1 pr-3 font-semibold text-right">Untagged</th>
            <th className="py-1 pr-3 font-semibold text-right">Rate</th>
            <th className="py-1 font-semibold text-right">Needs attention</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.periodStart} className={`border-t border-border-subtle ${d.isGap ? 'text-faint' : 'text-body'}`}>
              <td className="py-1 pr-3 whitespace-nowrap">{d.fullLabel}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatCount(d.total)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatCount(d.tagged)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatCount(d.untagged)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatRate(d.rate, 2)}</td>
              <td className="py-1 text-right tabular-nums">{formatCount(d.issues)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ), [data]);

  return (
    <ChartCard
      title="Coverage by business period"
      subtitle={singleFeed
        ? "Transactions per period, tagged and still untagged. The rate is the backend's own rate for the selected feed. Click a column to focus the breakdown."
        : 'Transactions per period, tagged and still untagged, summed across the selected feeds. Click a column to focus the breakdown.'}
      legend={LEGEND}
      chart={chart}
      table={table}
    />
  );
}
