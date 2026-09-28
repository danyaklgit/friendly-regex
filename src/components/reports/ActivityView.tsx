import { useMemo } from 'react';
import type { TaggingActivityReport } from '../../api/taggingActivity';
import { buildActivityRows, toActivityData, historyNotice, type RequestedRange } from '../../utils/reports/activityRows';
import { formatCount, formatRangeCaption } from '../../utils/reports/format';
import { EmptyState } from '../shared/EmptyState';
import { KpiTile } from './KpiTile';
import { ActivityColumnsChart } from './ActivityColumnsChart';
import { ReconstructedLineChart } from './ReconstructedLineChart';
import { SummaryCard } from './SummaryCard';
import { ReportsTabFallback } from './ReportsTabFallback';
import { ReportErrorCard } from './ReportErrorCard';

interface ActivityViewProps {
  report: TaggingActivityReport | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCopy: (text: string) => void;
  /** The range the UI sent (from the preset), for the history clamp and notice. */
  requested: RequestedRange;
}

/**
 * The Team activity sub-view. Tiles read Totals verbatim (Operators and
 * Workspaces are distinct counts over the whole range, never sums of
 * periods); the charts read zero-filled rows clamped to HistoryStartsAt.
 */
export function ActivityView({ report, loading, error, onRetry, onCopy, requested }: ActivityViewProps) {
  const rows = useMemo(() => (report ? buildActivityRows(report, requested) : []), [report, requested]);
  const data = useMemo(() => toActivityData(rows), [rows]);

  if (!report) {
    if (error) return <ReportErrorCard message={error} onRetry={onRetry} />;
    return <ReportsTabFallback />;
  }

  const totals = report.Totals;
  const notice = historyNotice(requested.from, report.HistoryStartsAt);
  const caption = formatRangeCaption('Activity periods', report.FromDate, report.ToDate, report.Granularity);
  const isEmpty = rows.length === 0;

  return (
    <div className="space-y-3">
      {error && <ReportErrorCard message={error} onRetry={onRetry} />}
      <div data-testid="activity-frame" aria-busy={loading || undefined} className={`space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <p className="text-xs text-muted">{caption}</p>
        {notice && <p className="text-[11px] text-body-secondary rounded-md border border-border-subtle bg-surface-secondary px-3 py-2">{notice}</p>}
        {isEmpty ? (
          <EmptyState title="No activity in this range" description="Try a wider date range." />
        ) : (
          <>
            <div data-testid="activity-tiles" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <KpiTile label="Check-ins" value={formatCount(totals.CheckIns)} caption={`${formatCount(totals.Saves)} saves · ${formatCount(totals.Rollbacks)} rollbacks`} hero />
              <KpiTile label="Rules added" value={formatCount(totals.RulesAdded)} caption="net of removals, never negative" />
              <KpiTile label="Operators" value={formatCount(totals.Operators)} caption="distinct people who checked in" />
              <KpiTile label="Workspaces" value={formatCount(totals.Workspaces)} caption="distinct bank and side workspaces touched" />
            </div>
            <ActivityColumnsChart data={data} />
            <ReconstructedLineChart data={data} reconstructed={report.TransactionsTaggedIsReconstructed} total={totals.TransactionsTagged} />
            <SummaryCard lines={report.SummaryLines} onCopy={() => onCopy(report.SummaryText)} copyDisabled={!report.SummaryText} />
          </>
        )}
      </div>
    </div>
  );
}
