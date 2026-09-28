import { useMemo } from 'react';
import type { TaggingMetrics, TaggingProgressSeries } from '../../api/taggingProgress';
import { formatCount, formatRate } from '../../utils/reports/format';
import { feedColor, feedLabel } from '../../utils/reports/feedSlots';

interface FeedTotalsTableProps {
  series: TaggingProgressSeries[];
  totals: TaggingMetrics;
}

function Cells({ m }: { m: TaggingMetrics }) {
  return (
    <>
      <td className="py-1 pr-3 text-right tabular-nums">{formatCount(m.TotalTransactionCount)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{formatCount(m.TotalTaggedCount)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{formatCount(m.UntaggedCount)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{formatRate(m.TaggingRate, 2)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{formatCount(m.IssuesCount)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{formatCount(m.MultiTaggedCount)}</td>
      <td className="py-1 text-right tabular-nums">{formatCount(m.DeadEndCount)}</td>
    </>
  );
}

/** One row per feed from its Totals (sorted by volume), footer = the report Totals. Backend numbers only. */
export function FeedTotalsTable({ series, totals }: FeedTotalsTableProps) {
  const sorted = useMemo(() => [...series].sort((a, b) => b.Totals.TotalTransactionCount - a.Totals.TotalTransactionCount), [series]);
  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-3 overflow-x-auto custom-scrollbar" aria-label="Per-feed totals">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-body-secondary mb-2">By feed</h3>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-faint">
            <th className="py-1 pr-3 font-semibold">Feed</th>
            <th className="py-1 pr-3 font-semibold text-right">Transactions</th>
            <th className="py-1 pr-3 font-semibold text-right">Tagged</th>
            <th className="py-1 pr-3 font-semibold text-right">Untagged</th>
            <th className="py-1 pr-3 font-semibold text-right">Rate</th>
            <th className="py-1 pr-3 font-semibold text-right">Needs attention</th>
            <th className="py-1 pr-3 font-semibold text-right">Multi-tagged</th>
            <th className="py-1 font-semibold text-right">Dead end</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.DataSetType} className="border-t border-border-subtle text-body">
              <td className="py-1 pr-3 whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5" title={s.DataSetType}>
                  <span aria-hidden data-feed-swatch className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: feedColor(s.DataSetType) }} />
                  {feedLabel(s.DataSetType)}
                </span>
              </td>
              <Cells m={s.Totals} />
            </tr>
          ))}
          <tr className="border-t border-border text-heading font-semibold">
            <td className="py-1 pr-3">All feeds</td>
            <Cells m={totals} />
          </tr>
        </tbody>
      </table>
    </section>
  );
}
