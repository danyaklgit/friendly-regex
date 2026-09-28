import type { TaggingMetrics } from '../../api/taggingProgress';
import { formatCount, formatRate } from '../../utils/reports/format';

interface BreakdownPanelProps {
  metrics: TaggingMetrics;
  /** "Whole range" or the selected period's full label. */
  scopeLabel: string;
  /** Present only while a period is selected. */
  onClearScope?: () => void;
}

const ROWS: { label: string; key: keyof TaggingMetrics }[] = [
  { label: 'Fully tagged', key: 'FullyTaggedCount' },
  { label: 'Multi-tagged', key: 'MultiTaggedCount' },
  { label: 'Dead end', key: 'DeadEndCount' },
  { label: 'Missing mandatory attribute', key: 'TaggedWithMissingMandatoryAttrCount' },
  { label: 'Missing optional attribute', key: 'TaggedWithMissingOptionalAttrCount' },
  { label: 'Invalid attribute', key: 'TaggedWithInvalidAttrCount' },
  { label: 'Needs attention', key: 'IssuesCount' },
];

/** Count + share of the scope total for each overlapping category. */
export function BreakdownPanel({ metrics, scopeLabel, onClearScope }: BreakdownPanelProps) {
  const total = metrics.TotalTransactionCount;
  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-3" aria-label="Breakdown">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-body-secondary">Breakdown</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary-dark dark:text-primary text-[11px] font-medium px-2 py-0.5">
          {scopeLabel}
          {onClearScope && (
            <button type="button" onClick={onClearScope} aria-label="Show whole range" title="Show whole range" className="ml-0.5 rounded hover:bg-primary/20 cursor-pointer leading-none">
              ×
            </button>
          )}
        </span>
      </div>
      <table className="w-full text-[11px]">
        <tbody>
          {ROWS.map((row) => {
            const count = metrics[row.key];
            return (
              <tr key={row.key} className="border-t border-border-subtle text-body">
                <td className="py-1 pr-3">{row.label}</td>
                <td className="py-1 pr-3 text-right tabular-nums font-medium text-heading">{formatCount(count)}</td>
                <td className="py-1 text-right tabular-nums text-muted w-16">{formatRate(total > 0 ? (count / total) * 100 : 0, 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted">
        Categories overlap: a transaction can appear in more than one row. Use Transactions, Untagged, and Tagging rate for headline numbers.
      </p>
    </section>
  );
}
