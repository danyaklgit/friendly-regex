import { memo, type Ref } from 'react';
import { CLIENT_SYNC_SHOWS, type ClientSyncShow, type ClientSyncTransaction, type ClientSyncTransactionsPage } from '../../api/clientSync';
import { SHOW_LABELS, showCount } from '../../utils/clientSync/status';
import { formatLocalTime, formatAmount, formatDurationMs, DASH } from '../../utils/clientSync/format';
import { formatCount } from '../../utils/reports/format';
import { SegmentedControl, type SegmentedOption } from '../shared/SegmentedControl';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { Tooltip } from '../shared/Tooltip';
import { EmptyState } from '../shared/EmptyState';
import { TagBadge } from '../transactions/TagBadge';
import { ReportErrorCard } from '../reports/ReportErrorCard';
import { FeedChip, KbStatusBadge, CertaintyPill, OutStatusBadge } from './StatusBadges';

interface TransactionsListProps {
  /** The section element, so the tab can scroll it into view from a warning click. */
  ref?: Ref<HTMLElement>;
  page: ClientSyncTransactionsPage | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  show: ClientSyncShow;
  onShowChange: (show: ClientSyncShow) => void;
  /** The draft search text; the tab debounces it before it reaches the request. */
  search: string;
  onSearchChange: (text: string) => void;
  canLoadMore: boolean;
  onLoadMore: (step: number) => void;
  selectedId: string | null;
  onSelect: (transaction: ClientSyncTransaction) => void;
  /** Only when the scope holds more than one account. */
  showIban: boolean;
  withDate: boolean;
  onExport: () => void;
}

const TH = 'text-left px-3 py-2 whitespace-nowrap';
const TD = 'px-3 py-2 align-top';

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading transactions" className="animate-pulse space-y-2 p-3">
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 rounded bg-surface-tertiary" />)}
    </div>
  );
}

/** The transactions list of spec 7.5: segments with server counts, search, rows, load-more, export. */
export const TransactionsList = memo(function TransactionsList({
  ref, page, loading, error, onRetry, show, onShowChange, search, onSearchChange, canLoadMore, onLoadMore,
  selectedId, onSelect, showIban, withDate, onExport,
}: TransactionsListProps) {
  const rows = page?.Transactions ?? [];
  const total = page?.TotalCount ?? 0;
  const options: SegmentedOption<ClientSyncShow>[] = CLIENT_SYNC_SHOWS.map((value) => {
    const count = page ? showCount(page.ShowCounts, value) : null;
    return { value, label: count === null ? SHOW_LABELS[value] : `${SHOW_LABELS[value]} ${formatCount(count)}` };
  });

  return (
    <section ref={ref} aria-label="Transactions" className="rounded-lg border border-border bg-surface scroll-mt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-body-secondary">Transactions</h2>
          {page && <p className="text-[11px] text-muted">{`${formatCount(total)} read, newest first`}</p>}
        </div>
        <input
          type="search"
          aria-label="Search transactions"
          placeholder="Search transactions"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="ml-auto w-56 rounded-lg border border-input-border bg-input-bg px-3 py-1.5 text-xs text-heading placeholder:text-placeholder focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button variant="secondary" size="xs" onClick={onExport} disabled={rows.length === 0}>Export CSV</Button>
      </div>
      <div className="px-4 py-2 border-b border-border overflow-x-auto">
        <SegmentedControl label="Show" options={options} value={show} onChange={onShowChange} />
      </div>

      {!page ? (
        error ? <div className="p-3"><ReportErrorCard message={error} onRetry={onRetry} /></div> : <ListSkeleton />
      ) : (
        <>
          {error && <div className="p-3"><ReportErrorCard message={error} onRetry={onRetry} /></div>}
          <div data-testid="transactions-frame" aria-busy={loading || undefined} className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
            {rows.length === 0 ? (
              <EmptyState title="Nothing received for these accounts on these days." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-secondary text-[10px] font-semibold uppercase tracking-wider text-body-secondary">
                    <tr>
                      <th className={TH}>Received</th>
                      <th className={TH}>Feed</th>
                      <th className={`${TH} text-right`}>Amount</th>
                      <th className={TH}>Sender / reference</th>
                      <th className={TH}>Tag</th>
                      <th className={TH}>Knowledge base</th>
                      <th className={TH}>Out</th>
                      {showIban && <th className={TH}>IBAN</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {rows.map((t) => {
                      const selected = t.Id === selectedId;
                      const receipt = t.Out.ReceiptToPushMs;
                      // A row without an Id has no trace to open (the drawer would spin forever).
                      const selectable = t.Id !== '';
                      return (
                        <tr
                          key={t.Id || t.BankReference}
                          aria-label={`Transaction ${t.BankReference || t.Id}`}
                          aria-selected={selected}
                          onClick={selectable ? () => onSelect(t) : undefined}
                          className={`${selectable ? 'cursor-pointer ' : ''}transition-colors ${selected ? 'bg-primary/10' : 'hover:bg-surface-hover'}`}
                        >
                          <td className={`${TD} whitespace-nowrap font-mono text-body-secondary`}>{formatLocalTime(t.ReceivedAtUtc, withDate) || DASH}</td>
                          <td className={`${TD} whitespace-nowrap`}><FeedChip dataSetType={t.DataSetType} isArchived={t.IsArchived} /></td>
                          <td className={`${TD} whitespace-nowrap text-right font-mono text-heading`}>
                            {formatAmount(t.Amount, t.Side)}
                            <div className="text-[10px] text-muted">{t.CurrencyCode}</div>
                          </td>
                          <td className={`${TD} min-w-48`}>
                            <div className="text-heading truncate max-w-64" dir="auto">{t.Sender || DASH}</div>
                            <Tooltip content={t.Narrative || DASH}>
                              <span className="font-mono text-[11px] text-body-secondary">{t.BankReference || DASH}</span>
                            </Tooltip>
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>
                            {t.IsUntagged ? (
                              <Badge variant="danger" size="xs">Untagged</Badge>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <TagBadge tag={t.Tag || DASH} />
                                {t.LayersDiffer && (
                                  <Tooltip content={`Operator tag ${t.OpsTag} not released yet`}>
                                    <span aria-label="Operator tag not released yet" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-cyan-100 text-[10px] font-bold text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">i</span>
                                  </Tooltip>
                                )}
                              </span>
                            )}
                            <div className="text-[10px] text-muted">{`${formatCount(t.AttributeCount)} attribute${t.AttributeCount === 1 ? '' : 's'}`}</div>
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>
                            <KbStatusBadge status={t.Kb.Status} context="list" />
                            {t.Kb.Status !== 'NotEligible' && (
                              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
                                <CertaintyPill certainty={t.Kb.Certainty} rank={t.Kb.CertaintyRank} />
                                {t.Kb.CustomerCode && <span className="font-mono">{t.Kb.CustomerCode}</span>}
                              </div>
                            )}
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>
                            <OutStatusBadge status={t.Out.Status} title={t.Out.Status === 'FAILED' ? (t.Out.LastError ?? undefined) : undefined} />
                            {t.Out.LastCallUtc && (
                              <div className="mt-0.5 text-[10px] text-muted">
                                {formatLocalTime(t.Out.LastCallUtc, withDate)}
                                {receipt !== null && ` · ${formatDurationMs(receipt)} after receipt`}
                              </div>
                            )}
                          </td>
                          {showIban && <td className={`${TD} whitespace-nowrap font-mono text-body-secondary`}>{t.IBAN}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-border text-[11px] text-muted">
            <span>{`Showing ${formatCount(rows.length)} of ${formatCount(total)}`}</span>
            {canLoadMore && (
              <>
                <Button variant="outline" size="xs" onClick={() => onLoadMore(50)}>+50</Button>
                <Button variant="outline" size="xs" onClick={() => onLoadMore(200)}>+200</Button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
});
