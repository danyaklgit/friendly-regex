import { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { rateDataKey, type FeedRateDatum } from '../../utils/reports/aggregate';
import { feedColor, feedLabel } from '../../utils/reports/feedSlots';
import { formatCount, formatRate } from '../../utils/reports/format';
import { ChartCard, type LegendItem } from './ChartCard';
import { ChartTooltipFrame, ChartTooltipRow } from './ChartTooltip';
import { activeRow, type TooltipRenderProps } from './activeRow';
import { REPORTS_SYNC_ID } from './CoverageColumnsChart';

const TICK = { fontSize: 10, fill: 'var(--color-muted)' };
const RATE_TICKS = [0, 25, 50, 75, 100];
const percentTick = (v: number) => `${v}%`;
// Hoisted so recharts sees a stable prop identity across re-renders it has no
// layout reason to react to (TagSpecContext's 1.5s poll re-renders ReportsTab
// while a tagging job runs); a fresh object every render forces a relayout.
const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };
const AXIS_LINE = { stroke: 'var(--color-border)' };
const CURSOR = { stroke: 'var(--color-border)' };
const ACTIVE_DOT = { r: 4, stroke: 'var(--color-surface)', strokeWidth: 2 };

interface FeedRateLinesChartProps {
  data: FeedRateDatum[];
  /** DataSetTypes in report order; colors are fixed per feed, not per position. */
  feeds: string[];
}

/**
 * Chart 2: one line per feed on a fixed 0 to 100 axis. `type="linear"`
 * because monotone smoothing would invent values between periods; a period
 * a feed has no point for is null and breaks the line (an absent period is
 * not zero). The tooltip carries each feed's count so a 100% rate over three
 * rows never looks as solid as 45% over ninety thousand.
 */
export function FeedRateLinesChart({ data, feeds }: FeedRateLinesChartProps) {
  const axisLabel = useMemo(() => {
    const labels = new Map(data.map((d) => [d.periodStart, d.axisLabel]));
    return (periodStart: string) => labels.get(periodStart) ?? periodStart;
  }, [data]);

  const renderTooltip = useMemo(() => (props: TooltipRenderProps) => {
    const row = activeRow<FeedRateDatum>(props);
    if (!row) return null;
    return (
      <ChartTooltipFrame title={row.title}>
        {feeds.map((feed) => {
          const v = row.feeds[feed];
          return (
            <ChartTooltipRow
              key={feed}
              value={v ? formatRate(v.rate, 2) : 'no data'}
              label={v ? `${feedLabel(feed)} · ${formatCount(v.count)} txns` : feedLabel(feed)}
              color={feedColor(feed)}
            />
          );
        })}
      </ChartTooltipFrame>
    );
  }, [feeds]);

  const legend = useMemo<LegendItem[] | undefined>(() => (feeds.length > 1
    ? feeds.map((feed) => ({ label: feedLabel(feed), color: feedColor(feed), shape: 'line' as const }))
    : undefined), [feeds]);

  const chart = (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} syncId={REPORTS_SYNC_ID} syncMethod="value" margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
        <XAxis dataKey="periodStart" tickFormatter={axisLabel} interval="preserveStartEnd" minTickGap={24} tick={TICK} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis width="auto" domain={[0, 100]} ticks={RATE_TICKS} tickFormatter={percentTick} tick={TICK} axisLine={false} tickLine={false} />
        <Tooltip content={renderTooltip} cursor={CURSOR} isAnimationActive={false} />
        {feeds.map((feed) => (
          <Line
            key={feed}
            type="linear"
            dataKey={rateDataKey(feed)}
            name={feedLabel(feed)}
            stroke={feedColor(feed)}
            strokeWidth={2}
            dot={false}
            activeDot={ACTIVE_DOT}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  const table = useMemo(() => (
    <div className="max-h-80 overflow-auto custom-scrollbar">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-[10px] uppercase tracking-wide text-faint">
            <th className="py-1 pr-3 font-semibold">Period</th>
            {feeds.map((feed) => <th key={feed} className="py-1 pr-3 font-semibold text-right">{feedLabel(feed)}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.periodStart} className="border-t border-border-subtle text-body">
              <td className="py-1 pr-3 whitespace-nowrap">{d.fullLabel}</td>
              {feeds.map((feed) => {
                const v = d.feeds[feed];
                return (
                  <td key={feed} className={`py-1 pr-3 text-right tabular-nums ${v ? '' : 'text-faint'}`}>
                    {v ? `${formatRate(v.rate, 2)} (${formatCount(v.count)})` : 'no data'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ), [data, feeds]);

  return (
    <ChartCard
      title="Coverage rate by feed"
      subtitle={feeds.length === 1 ? `${feedLabel(feeds[0])}, tagging rate per period` : 'Tagging rate per feed and period, 0 to 100%. Hover for each feed’s transaction count.'}
      legend={legend}
      chart={chart}
      table={table}
    />
  );
}
