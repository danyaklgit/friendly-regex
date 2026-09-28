import { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { ActivityDatum } from '../../utils/reports/activityRows';
import { formatCount } from '../../utils/reports/format';
import { ChartCard } from './ChartCard';
import { ChartTooltipFrame, ChartTooltipRow } from './ChartTooltip';
import { activeRow, type TooltipRenderProps } from './activeRow';
import { ACTIVITY_SYNC_ID } from './ActivityColumnsChart';

/** Muted gray: the estimate is visually secondary to the measured series on purpose. */
export const ESTIMATE_COLOR = 'var(--color-muted)';
const TICK = { fontSize: 10, fill: 'var(--color-muted)' };
const BIAS_NOTE = 'Estimated as the later of a row’s arrival and its rule’s first release. A rule edited later to catch more rows dates those rows too early, and a row tagged, untagged and re-tagged is seen only in its final state.';
// Hoisted so recharts sees a stable prop identity across re-renders it has no
// layout reason to react to (TagSpecContext's 1.5s poll re-renders ReportsTab
// while a tagging job runs); a fresh object every render forces a relayout.
const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };
const AXIS_LINE = { stroke: 'var(--color-border)' };
const CURSOR = { stroke: 'var(--color-border)' };
const ACTIVE_DOT = { r: 4, stroke: 'var(--color-surface)', strokeWidth: 2 };

interface ReconstructedLineChartProps {
  data: ActivityDatum[];
  /** TransactionsTaggedIsReconstructed from the backend. Every caveat keys off it. */
  reconstructed: boolean;
  /** Totals.TransactionsTagged for the range. */
  total: number;
}

/**
 * Activity chart B: TransactionsTagged on its own axis (thousands to millions
 * against the tens to hundreds of chart A; never a dual axis). Dashed, muted,
 * "~"-prefixed while the backend flags the figure as reconstructed; a plain
 * recorded chart the day it stops being one.
 */
export function ReconstructedLineChart({ data, reconstructed, total }: ReconstructedLineChartProps) {
  const prefix = reconstructed ? '~' : '';
  const axisLabel = useMemo(() => {
    const labels = new Map(data.map((d) => [d.periodStart, d.axisLabel]));
    return (periodStart: string) => labels.get(periodStart) ?? periodStart;
  }, [data]);

  const renderTooltip = useMemo(() => (props: TooltipRenderProps) => {
    const row = activeRow<ActivityDatum>(props);
    if (!row) return null;
    return (
      <ChartTooltipFrame title={row.fullLabel}>
        <ChartTooltipRow value={`${prefix}${formatCount(row.transactionsTagged)}`} label={reconstructed ? 'Transactions tagged (estimate)' : 'Transactions tagged'} color={ESTIMATE_COLOR} />
      </ChartTooltipFrame>
    );
  }, [prefix, reconstructed]);

  const chart = (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} syncId={ACTIVITY_SYNC_ID} syncMethod="value" margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
        <XAxis dataKey="periodStart" tickFormatter={axisLabel} interval="preserveStartEnd" minTickGap={24} tick={TICK} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis width="auto" allowDecimals={false} tickFormatter={formatCount} tick={TICK} axisLine={false} tickLine={false} />
        <Tooltip content={renderTooltip} cursor={CURSOR} isAnimationActive={false} />
        <Line
          type="linear"
          dataKey="transactionsTagged"
          name="Transactions tagged"
          stroke={ESTIMATE_COLOR}
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          activeDot={ACTIVE_DOT}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  const table = useMemo(() => (
    <div className="max-h-80 overflow-auto custom-scrollbar">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-[10px] uppercase tracking-wide text-faint">
            <th className="py-1 pr-3 font-semibold">Period</th>
            <th className="py-1 font-semibold text-right">{reconstructed ? 'Transactions tagged (estimate)' : 'Transactions tagged'}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.periodStart} className={`border-t border-border-subtle ${d.isGap ? 'text-faint' : 'text-body'}`}>
              <td className="py-1 pr-3 whitespace-nowrap">{d.fullLabel}</td>
              <td className="py-1 text-right tabular-nums">{`${prefix}${formatCount(d.transactionsTagged)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ), [data, reconstructed, prefix]);

  return (
    <ChartCard
      title={reconstructed ? 'Transactions tagged, reconstructed estimate' : 'Transactions tagged'}
      subtitle={`${prefix}${formatCount(total)} in range`}
      chart={chart}
      table={table}
      footnote={reconstructed ? BIAS_NOTE : undefined}
    />
  );
}
