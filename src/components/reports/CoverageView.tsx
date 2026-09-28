import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaggingProgressReport, TaggingMetrics } from '../../api/taggingProgress';
import type { TaggingGranularity } from '../../api/taggingReportsShared';
import { buildPeriodRows, toCoverageData, toFeedRateData, isDenseAxis } from '../../utils/reports/aggregate';
import { formatCount, formatRate, formatRangeCaption } from '../../utils/reports/format';
import { LAYER_LABELS } from '../../utils/reports/labels';
import { EmptyState } from '../shared/EmptyState';
import { KpiTile } from './KpiTile';
import { CoverageColumnsChart } from './CoverageColumnsChart';
import { FeedRateLinesChart } from './FeedRateLinesChart';
import { BreakdownPanel } from './BreakdownPanel';
import { FeedTotalsTable } from './FeedTotalsTable';
import { SummaryCard } from './SummaryCard';
import { ReportsTabFallback } from './ReportsTabFallback';
import { ReportErrorCard } from './ReportErrorCard';

interface CoverageViewProps {
  report: TaggingProgressReport | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCopy: (text: string) => void;
}

/**
 * The Coverage sub-view: tiles and tables read the backend's Totals verbatim;
 * the charts read the per-period rows. A selected period scopes only the
 * Breakdown panel, and the selection is derived-valid: it survives a refetch
 * while that period still exists (with data), and silently clears when it
 * does not. A gap period (no point in any feed) cannot be selected.
 */
export function CoverageView({ report, loading, error, onRetry, onCopy }: CoverageViewProps) {
  const [selection, setSelection] = useState<{ periodStart: string; granularity: TaggingGranularity } | null>(null);

  const rows = useMemo(() => (report ? buildPeriodRows(report) : []), [report]);
  const feeds = useMemo(() => (report ? report.Series.map((s) => s.DataSetType) : []), [report]);
  const coverageData = useMemo(() => toCoverageData(rows), [rows]);
  const feedRateData = useMemo(() => toFeedRateData(rows, feeds), [rows, feeds]);
  // Period strings collide across granularities (a Month's PeriodStart is also
  // a Day's, a Week's, sometimes a Year's), so a selection only resolves to a
  // row when the report is still on the SAME granularity it was made under;
  // a granularity change silently derives back to "no selection" instead of
  // re-scoping to whatever period the new axis happens to share the string with.
  const selectedRow = useMemo(
    () => (selection && report && report.Granularity === selection.granularity
      ? rows.find((r) => r.periodStart === selection.periodStart && r.metrics !== null) ?? null
      : null),
    [rows, selection, report],
  );
  const handleSelectPeriod = useCallback((periodStart: string) => {
    if (!report) return;
    setSelection({ periodStart, granularity: report.Granularity });
  }, [report]);

  // A granularity change clears the selection outright (spec 5.3): once a
  // report on a different granularity has arrived, the old selection must not
  // resurface when the operator returns to the granularity it was made under.
  useEffect(() => {
    if (selection && report && report.Granularity !== selection.granularity) setSelection(null);
  }, [report, selection]);

  if (!report) {
    if (error) return <ReportErrorCard message={error} onRetry={onRetry} />;
    return <ReportsTabFallback />;
  }

  const totals: TaggingMetrics = report.Totals;
  const isEmpty = report.Series.length === 0 || rows.length === 0;
  const breakdownMetrics = selectedRow?.metrics ?? totals;
  const scopeLabel = selectedRow ? selectedRow.fullLabel : 'Whole range';
  const caption = formatRangeCaption('Business periods', report.FromDate, report.ToDate, report.Granularity, LAYER_LABELS[report.Layer]);

  return (
    <div className="space-y-3">
      {error && <ReportErrorCard message={error} onRetry={onRetry} />}
      <div data-testid="coverage-frame" aria-busy={loading || undefined} className={`space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <p className="text-xs text-muted">{caption}</p>
        {isEmpty ? (
          <EmptyState title="No transactions in this range" description="Try a wider date range or fewer filters." />
        ) : (
          <>
            <div data-testid="coverage-tiles" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <KpiTile label="Transactions" value={formatCount(totals.TotalTransactionCount)} caption="in range" />
              <KpiTile label="Tagging rate" value={formatRate(totals.TaggingRate, 1)} caption="tagged over total; dead ends count as tagged" hero />
              <KpiTile label="Untagged" value={formatCount(totals.UntaggedCount)} caption="waiting for a rule" />
              <KpiTile label="Needs attention" value={formatCount(totals.IssuesCount)} caption="missing mandatory, invalid attribute, or multi-tagged" />
            </div>
            {isDenseAxis(rows) && (
              <p className="text-xs text-muted">{`Showing ${formatCount(rows.length)} periods. Switch to Week or Month, or narrow the range, for a clearer chart.`}</p>
            )}
            <CoverageColumnsChart data={coverageData} selectedPeriod={selectedRow ? selectedRow.periodStart : null} onSelectPeriod={handleSelectPeriod} singleFeed={feeds.length === 1} />
            <FeedRateLinesChart data={feedRateData} feeds={feeds} />
            <div className="grid gap-3 lg:grid-cols-2">
              <BreakdownPanel metrics={breakdownMetrics} scopeLabel={scopeLabel} onClearScope={selectedRow ? () => setSelection(null) : undefined} />
              <FeedTotalsTable series={report.Series} totals={totals} />
            </div>
            <SummaryCard lines={report.SummaryLines} onCopy={() => onCopy(report.SummaryText)} copyDisabled={!report.SummaryText} />
          </>
        )}
      </div>
    </div>
  );
}
