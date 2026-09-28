import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { ActivityDatum } from '../../utils/reports/activityRows';
import { formatCount } from '../../utils/reports/format';
import { ChartCard, type LegendItem } from './ChartCard';
import { ChartTooltipFrame, ChartTooltipRow } from './ChartTooltip';
import { activeRow, type TooltipRenderProps } from './activeRow';

/** Shared by both activity charts so hovering one highlights the same period in the other. */
export const ACTIVITY_SYNC_ID = 'tep-activity';
export const CHECKINS_COLOR = 'var(--color-chart-1)';
/** Violet, not orange: orange means "untagged" on the Coverage view. Pair validated with slot 1 in both modes (spec 16.6). */
export const RULES_ADDED_COLOR = 'var(--color-chart-3)';

const TICK = { fontSize: 10, fill: 'var(--color-muted)' };
// Hoisted so recharts sees a stable prop identity across re-renders it has no
// layout reason to react to (TagSpecContext's 1.5s poll re-renders ReportsTab
// while a tagging job runs); a fresh object every render forces a relayout.
const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };
const AXIS_LINE = { stroke: 'var(--color-border)' };
const CURSOR = { fill: 'var(--color-surface-hover)' };
const LEGEND: LegendItem[] = [
  { label: 'Check-ins', color: CHECKINS_COLOR, shape: 'rect' },
  { label: 'Rules added (net)', color: RULES_ADDED_COLOR, shape: 'rect' },
];

function ActivityTooltip(props: TooltipRenderProps) {
  const row = activeRow<ActivityDatum>(props);
  if (!row) return null;
  return (
    <ChartTooltipFrame title={row.fullLabel}>
      <ChartTooltipRow value={formatCount(row.checkIns)} label="Check-ins" color={CHECKINS_COLOR} />
      <ChartTooltipRow value={formatCount(row.rulesAdded)} label="Rules added (net)" color={RULES_ADDED_COLOR} />
      <ChartTooltipRow value={formatCount(row.saves)} label="Saves" />
      <ChartTooltipRow value={formatCount(row.rollbacks)} label="Rollbacks" />
      <ChartTooltipRow value={formatCount(row.operators)} label="Operators" />
      <ChartTooltipRow value={formatCount(row.workspaces)} label="Workspaces" />
    </ChartTooltipFrame>
  );
}

/** Activity chart A: the two measured "work done" series as grouped columns. Values are copied from the backend, never derived. */
export function ActivityColumnsChart({ data }: { data: ActivityDatum[] }) {
  const axisLabel = useMemo(() => {
    const labels = new Map(data.map((d) => [d.periodStart, d.axisLabel]));
    return (periodStart: string) => labels.get(periodStart) ?? periodStart;
  }, [data]);

  const chart = (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} syncId={ACTIVITY_SYNC_ID} syncMethod="value" barGap={2} margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
        <XAxis dataKey="periodStart" tickFormatter={axisLabel} interval="preserveStartEnd" minTickGap={24} tick={TICK} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis width="auto" allowDecimals={false} tickFormatter={formatCount} tick={TICK} axisLine={false} tickLine={false} />
        <Tooltip content={ActivityTooltip} cursor={CURSOR} isAnimationActive={false} />
        <Bar dataKey="checkIns" name="Check-ins" fill={CHECKINS_COLOR} stroke="var(--color-surface)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        <Bar dataKey="rulesAdded" name="Rules added (net)" fill={RULES_ADDED_COLOR} stroke="var(--color-surface)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );

  const table = useMemo(() => (
    <div className="max-h-80 overflow-auto custom-scrollbar">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-[10px] uppercase tracking-wide text-faint">
            <th className="py-1 pr-3 font-semibold">Period</th>
            <th className="py-1 pr-3 font-semibold text-right">Check-ins</th>
            <th className="py-1 pr-3 font-semibold text-right">Rules added</th>
            <th className="py-1 pr-3 font-semibold text-right">Saves</th>
            <th className="py-1 pr-3 font-semibold text-right">Rollbacks</th>
            <th className="py-1 pr-3 font-semibold text-right">Operators</th>
            <th className="py-1 font-semibold text-right">Workspaces</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.periodStart} className={`border-t border-border-subtle ${d.isGap ? 'text-faint' : 'text-body'}`}>
              <td className="py-1 pr-3 whitespace-nowrap">{d.fullLabel}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatCount(d.checkIns)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatCount(d.rulesAdded)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatCount(d.saves)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatCount(d.rollbacks)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatCount(d.operators)}</td>
              <td className="py-1 text-right tabular-nums">{formatCount(d.workspaces)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ), [data]);

  return (
    <ChartCard
      title="Check-ins and rules added"
      subtitle="Recorded from the tagging library audit trail. Rules added is the net change per period and never negative."
      legend={LEGEND}
      chart={chart}
      table={table}
    />
  );
}
