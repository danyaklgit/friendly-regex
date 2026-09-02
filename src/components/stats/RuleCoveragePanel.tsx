import { useMemo } from 'react';
import type { TagRuleLibraryCoverage } from '../../api/transactions';
import { buildCoverageTimeline } from '../../utils/coverageTimeline';
import { Tooltip } from '../shared/Tooltip';

interface RuleCoveragePanelProps {
  coverage: TagRuleLibraryCoverage;
  /** Definition ids of the displayed library, joined by tag name (matches are
   *  attributed by TAG — definition ids are not persisted server-side). */
  idsByTag: Map<string, string[]>;
}

/**
 * Per-rule coverage panel inside an expanded Backlog card. Three columns:
 * rule name + its definition id(s), the match count (multi-tag subset
 * beneath), and a shared month-scale timeline where each rule's bar spans
 * its matched date range with day precision. One row per RULE VARIANT
 * (2026-09-02 delta): rows sort alphabetically by tag then VariantIndex,
 * a vN chip separates same-tag variants and RuleSummary subtitles them.
 * Zero-match variants sit inline with a "coverage gap" badge instead of a
 * bar; the VariantIndex 0 leftover bucket (rows no current variant matches)
 * carries a red "no longer matched" marker.
 */
export function RuleCoveragePanel({ coverage, idsByTag }: RuleCoveragePanelProps) {
  const rules = useMemo(
    () =>
      [...coverage.Rules].sort(
        (a, b) =>
          a.Tag.localeCompare(b.Tag, undefined, { sensitivity: 'base' }) ||
          a.VariantIndex - b.VariantIndex,
      ),
    [coverage.Rules],
  );
  // Variants per tag (excluding the VariantIndex 0 leftover bucket) — drives
  // the vN chip and the sum-caveat tooltip on multi-variant tags.
  const variantCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of coverage.Rules) {
      if (r.VariantIndex === 0) continue;
      counts.set(r.Tag, (counts.get(r.Tag) ?? 0) + 1);
    }
    return counts;
  }, [coverage.Rules]);

  const timeline = useMemo(
    () => buildCoverageTimeline(rules.filter((r) => r.MatchedCount > 0).map((r) => ({ from: r.FromDate, to: r.ToDate }))),
    [rules],
  );

  if (rules.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-body-secondary">Rule coverage</p>
        <p className="text-[11px] text-muted">
          {coverage.MatchedTransactionsCount.toLocaleString()} distinct matched transaction{coverage.MatchedTransactionsCount === 1 ? '' : 's'}
        </p>
      </div>

      <div className="grid gap-x-4 gap-y-1 items-center" style={{ gridTemplateColumns: 'minmax(160px, 230px) 72px 1fr' }}>
        {/* Header row: month scale above the timeline column. */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-faint self-end pb-0.5">Rule</div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-faint text-right self-end pb-0.5">Matches</div>
        <div className="relative h-5">
          {timeline?.months.map((m) => (
            <div
              key={m.key}
              className="absolute bottom-0 top-0 border-l border-border-subtle"
              style={{ left: `${m.startPct}%`, width: `${m.widthPct}%` }}
            >
              {m.labeled && (
                <span className="absolute bottom-0 left-0.5 text-[9px] text-faint whitespace-nowrap select-none">{m.label}</span>
              )}
            </div>
          ))}
        </div>

        {rules.map((rule) => {
          // Join BY POSITION: VariantIndex is 1-based within this tag's
          // definitions in stored order (ids are not stable server-side).
          const id = rule.VariantIndex > 0 ? (idsByTag.get(rule.Tag) ?? [])[rule.VariantIndex - 1] : undefined;
          const idLabel = id ? (id.length > 11 ? `${id.slice(0, 10)}…` : id) : '';
          const isLeftover = rule.VariantIndex === 0;
          const isGap = rule.MatchedCount === 0 && !isLeftover;
          const multiVariant = (variantCounts.get(rule.Tag) ?? 0) > 1;
          const bar = rule.MatchedCount > 0 && rule.FromDate && rule.ToDate && timeline
            ? timeline.barFor(rule.FromDate, rule.ToDate)
            : null;
          return (
            // Fragment-per-row inside one grid keeps the three columns aligned.
            <div key={`${rule.Tag}#${rule.VariantIndex}`} className="contents">
              <div className="min-w-0 py-0.5">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-heading">{rule.Tag}</span>
                  {multiVariant && rule.VariantIndex > 0 && (
                    <span className="inline-flex items-center rounded px-1 py-px text-[9px] font-semibold border border-border bg-surface-secondary text-body-secondary">v{rule.VariantIndex}</span>
                  )}
                  {idLabel && (
                    <span className="font-mono text-[10px] text-faint" title={id}>({idLabel})</span>
                  )}
                  {isLeftover && (
                    <span
                      className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800"
                      title="Rows no current rule variant matches — the tag was removed from the library, or its rules were edited after these rows were tagged."
                    >
                      no longer matched
                    </span>
                  )}
                </div>
                {rule.RuleSummary && (
                  <div className="text-[10px] text-muted leading-tight truncate" title={rule.RuleSummary}>{rule.RuleSummary}</div>
                )}
              </div>
              <div
                className="text-right py-0.5"
                title={multiVariant ? 'A row matching several variants of this tag counts in each of them, so the variant counts can sum past the distinct total.' : undefined}
              >
                <span className={`text-xs font-semibold tabular-nums ${isGap ? 'text-amber-700 dark:text-amber-300' : 'text-heading'}`}>
                  {rule.MatchedCount.toLocaleString()}
                </span>
                {rule.MultiTagCount > 0 && (
                  <div className="text-[10px] text-muted leading-tight">{rule.MultiTagCount.toLocaleString()} multi-tag</div>
                )}
              </div>
              <div className="relative h-5 self-stretch">
                {timeline?.months.map((m) => (
                  <div
                    key={m.key}
                    className="absolute top-0 bottom-0 border-l border-border-subtle/60"
                    style={{ left: `${m.startPct}%` }}
                  />
                ))}
                {bar ? (
                  <Tooltip
                    placement="top"
                    content={`${rule.Tag}: ${rule.MatchedCount.toLocaleString()} transaction${rule.MatchedCount === 1 ? '' : 's'} from ${rule.FromDate} to ${rule.ToDate}${rule.MultiTagCount > 0 ? ` · ${rule.MultiTagCount.toLocaleString()} multi-tag` : ''}`}
                  >
                    <div
                      className="absolute top-1 bottom-1 rounded-sm bg-primary/70 hover:bg-primary transition-colors cursor-default"
                      style={{ left: `${bar.leftPct}%`, width: `${Math.max(bar.widthPct, 0.4)}%`, minWidth: 3 }}
                    >
                      {/* Day-precision end caps: the exact first/last matched day. */}
                      <span className="absolute inset-y-0 left-0 w-[2px] bg-primary-dark rounded-l-sm" />
                      <span className="absolute inset-y-0 right-0 w-[2px] bg-primary-dark rounded-r-sm" />
                    </div>
                  </Tooltip>
                ) : isGap ? (
                  <span className="absolute inset-y-0 left-0 inline-flex items-center">
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide border border-amber-200 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                      coverage gap
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
