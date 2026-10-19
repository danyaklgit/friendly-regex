import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TepHeaders } from '../../api/transactions';
import {
  getAllClientSyncTransactions, UNTAGGED_TAG_FILTER,
  type ClientSyncShow, type ClientSyncSide, type ClientSyncTransaction,
} from '../../api/clientSync';
import { useVipClients } from '../../hooks/useVipClients';
import { useClientSyncSummary, useClientSyncTransactions, useClientSyncTrace } from '../../hooks/useClientSync';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  readStoredControls, writeStoredControls, buildScope, buildTransactionsRequest, rangeError as computeRangeError,
  resolveRange, spansDays, nextLimit, AUTO_REFRESH_MS, PAGE_SIZE_INITIAL, PAGE_SIZE_MAX, type ClientSyncControls,
} from '../../utils/clientSync/scope';
import { downloadClientSyncCsv } from '../../utils/clientSync/csv';
import { todayIso } from '../../utils/reports/controls';
import { formatCount } from '../../utils/reports/format';
import type { ChecklistOption } from '../reports/FilterChecklistPopover';
import { EmptyState } from '../shared/EmptyState';
import { ReportErrorCard } from '../reports/ReportErrorCard';
import { ScopeBar } from './ScopeBar';
import { WarningsStrip } from './WarningsStrip';
import { StageCards } from './StageCards';
import { AccountsTable } from './AccountsTable';
import { TransactionsList } from './TransactionsList';
import { TraceDrawer } from './TraceDrawer';
import { ClientSyncFallback } from './ClientSyncFallback';

interface ClientSyncTabProps {
  authToken: string | null;
  tepHeaders: TepHeaders | null;
}

const SEARCH_DEBOUNCE_MS = 400;

function localStore(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

/**
 * Client Sync tab root (spec sections 5 and 6): owns the persisted controls,
 * runs the hooks, and lays out scope bar, warnings, cards, accounts, list
 * and the trace drawer. Quick filter, search, side and tag filters, window
 * size and selection are component state and reset whenever the scope
 * changes (the tag choices belong to the scope's summary).
 */
export function ClientSyncTab({ authToken, tepHeaders }: ClientSyncTabProps) {
  const [controls, setControls] = useState<ClientSyncControls>(() => readStoredControls(localStore()));
  useEffect(() => { writeStoredControls(localStore(), controls); }, [controls]);
  const updateControls = useCallback((patch: Partial<ClientSyncControls>) => setControls((prev) => ({ ...prev, ...patch })), []);

  const vip = useVipClients(authToken, tepHeaders);

  // Once the VIP list has loaded, drop a stored client that is no longer on it and stored
  // accounts that are not on the chosen client (render-time adjustment; the guards make it settle in one pass).
  if (!vip.loading && !vip.error && vip.clients.length > 0 && controls.orgId !== '') {
    const owner = vip.clients.find((c) => c.orgId === controls.orgId);
    if (!owner) {
      setControls((prev) => ({ ...prev, orgId: '', ibans: [] }));
    } else {
      const known = new Set(owner.accounts.map((a) => a.iban));
      if (controls.ibans.some((iban) => !known.has(iban))) {
        setControls((prev) => ({ ...prev, ibans: prev.ibans.filter((iban) => known.has(iban)) }));
      }
    }
  }

  const today = todayIso();
  const scope = useMemo(() => buildScope(controls, today), [controls, today]);
  const range = resolveRange(controls, today);
  const rangeError = computeRangeError(controls, today);
  const enabled = controls.orgId !== '' && rangeError === null;

  const [show, setShow] = useState<ClientSyncShow>('ALL');
  const [search, setSearch] = useState('');
  const [side, setSide] = useState<ClientSyncSide>('ALL');
  const [tags, setTags] = useState<string[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE_INITIAL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Reset the list state when the scope changes (render-time adjustment, no extra effect pass).
  const scopeKey = JSON.stringify(scope);
  const [prevScopeKey, setPrevScopeKey] = useState(scopeKey);
  if (scopeKey !== prevScopeKey) {
    setPrevScopeKey(scopeKey);
    setShow('ALL');
    setSearch('');
    setSide('ALL');
    setTags([]);
    setLimit(PAGE_SIZE_INITIAL);
    setSelectedId(null);
    setExportError(null);
  }

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  // Clearing (scope reset or manual) must reach the request immediately; only typing is debounced.
  const effectiveSearch = search === '' ? '' : debouncedSearch;
  const listRequest = useMemo(
    () => buildTransactionsRequest(scope, show, effectiveSearch, limit, { side, tags }),
    [scope, show, effectiveSearch, limit, side, tags],
  );

  const summary = useClientSyncSummary(scope, authToken, tepHeaders, enabled);
  const list = useClientSyncTransactions(listRequest, authToken, tepHeaders, enabled);
  const trace = useClientSyncTrace(selectedId, authToken, tepHeaders);

  const refetchSummary = summary.refetch;
  const refetchList = list.refetch;
  const refreshAll = useCallback(() => { refetchSummary(); refetchList(); }, [refetchSummary, refetchList]);
  // A tick must not abort and restart a response that is still in flight (one slower than the interval).
  const busy = summary.loading || list.loading;
  const handleTick = useCallback(() => { if (!busy) refreshAll(); }, [busy, refreshAll]);
  useAutoRefresh({ enabled: enabled && controls.autoRefresh, intervalMs: AUTO_REFRESH_MS, onTick: handleTick });

  const listRef = useRef<HTMLElement>(null);
  const handleShowFromWarning = useCallback((next: ClientSyncShow) => {
    setShow(next);
    setLimit(PAGE_SIZE_INITIAL);
    listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);
  const handleShowChange = useCallback((next: ClientSyncShow) => {
    setShow(next);
    setLimit(PAGE_SIZE_INITIAL);
  }, []);
  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    setLimit(PAGE_SIZE_INITIAL);
  }, []);
  const handleSideChange = useCallback((next: ClientSyncSide) => {
    setSide(next);
    setLimit(PAGE_SIZE_INITIAL);
  }, []);
  const handleTagsChange = useCallback((next: string[]) => {
    setTags(next);
    setLimit(PAGE_SIZE_INITIAL);
  }, []);
  const handleLoadMore = useCallback((step: number) => setLimit((l) => nextLimit(l, step)), []);
  // A row without an Id has no trace to open; selecting it would leave the drawer loading forever.
  const handleSelect = useCallback((t: ClientSyncTransaction) => { if (t.Id !== '') setSelectedId(t.Id); }, []);
  const handleClose = useCallback(() => setSelectedId(null), []);

  const page = enabled ? list.report : null;
  const pageRows = page?.Transactions;
  const rows = useMemo(() => pageRows ?? [], [pageRows]);
  const canLoadMore = page !== null && rows.length < page.TotalCount && limit < PAGE_SIZE_MAX;
  const client = vip.clients.find((c) => c.orgId === controls.orgId) ?? null;
  const accountCount = controls.ibans.length > 0 ? controls.ibans.length : client?.accounts.length ?? 0;
  const withDate = spansDays(range.from, range.to);

  // The file must match the filter, not what was scrolled into view: when more rows match than
  // are loaded, walk every page of the same query first. Unmount aborts an export in flight.
  const exportAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => exportAbortRef.current?.abort(), []);
  const totalCount = page?.TotalCount ?? 0;
  const handleExport = useCallback(async () => {
    setExportError(null);
    if (rows.length >= totalCount || !authToken || !tepHeaders) {
      downloadClientSyncCsv(rows, controls.orgId, range.from, range.to);
      return;
    }
    exportAbortRef.current?.abort();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExporting(true);
    try {
      const all = await getAllClientSyncTransactions(listRequest, authToken, tepHeaders, controller.signal);
      if (!controller.signal.aborted) downloadClientSyncCsv(all, controls.orgId, range.from, range.to);
    } catch (err) {
      if (!controller.signal.aborted) setExportError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
        setExporting(false);
      }
    }
  }, [rows, totalCount, authToken, tepHeaders, listRequest, controls.orgId, range.from, range.to]);

  const summaryReport = enabled ? summary.report : null;
  const tagging = summaryReport?.Tagging ?? null;
  const tagOptions = useMemo<ChecklistOption[]>(() => {
    if (!tagging) return [];
    return [
      { value: UNTAGGED_TAG_FILTER, label: 'Untagged', count: formatCount(tagging.Untagged) },
      ...tagging.ByTag.filter((t) => t.Key !== '').map((t) => ({ value: t.Key, label: t.Key, count: formatCount(t.Count) })),
    ];
  }, [tagging]);

  return (
    <div className="space-y-3">
      <ScopeBar
        clients={vip.clients}
        clientsLoading={vip.loading}
        clientsError={vip.error}
        onRetryClients={vip.refetch}
        controls={controls}
        onChange={updateControls}
        rangeError={rangeError}
        generatedAtUtc={summaryReport?.GeneratedAtUtc ?? null}
        loading={summary.loading || list.loading}
        onRefresh={refreshAll}
      />
      {!controls.orgId ? (
        <section aria-label="Transactions" className="rounded-lg border border-border bg-surface">
          <EmptyState title="Pick a client to see its accounts." />
        </section>
      ) : (
        <>
          {enabled && summary.error && <ReportErrorCard message={summary.error} onRetry={summary.refetch} />}
          {summaryReport ? (
            <div data-testid="summary-frame" aria-busy={summary.loading || undefined} className={`space-y-3 transition-opacity ${summary.loading ? 'opacity-60' : ''}`}>
              <WarningsStrip warnings={summaryReport.Warnings} onShow={handleShowFromWarning} />
              <StageCards summary={summaryReport} withDate={withDate} />
              <AccountsTable accounts={summaryReport.Accounts} withDate={withDate} />
            </div>
          ) : (
            enabled && !summary.error && <ClientSyncFallback />
          )}
          <TransactionsList
            ref={listRef}
            page={page}
            loading={list.loading}
            error={enabled ? list.error : null}
            onRetry={list.refetch}
            show={show}
            onShowChange={handleShowChange}
            search={search}
            onSearchChange={handleSearchChange}
            side={side}
            onSideChange={handleSideChange}
            tags={tags}
            onTagsChange={handleTagsChange}
            tagOptions={tagOptions}
            canLoadMore={canLoadMore}
            onLoadMore={handleLoadMore}
            selectedId={selectedId}
            onSelect={handleSelect}
            showIban={accountCount > 1}
            withDate={withDate}
            onExport={handleExport}
            exporting={exporting}
            exportError={exportError}
          />
        </>
      )}
      <TraceDrawer
        transactionId={selectedId}
        trace={trace.report}
        loading={trace.loading}
        error={trace.error}
        onRetry={trace.refetch}
        onClose={handleClose}
        withDate={withDate}
      />
    </div>
  );
}
