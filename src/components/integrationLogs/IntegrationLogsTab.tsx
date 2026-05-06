import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import { useTransactionData } from '../../hooks/useTransactionData';
import {
  getIntegrationLogs,
  rerunIntegrationRequest,
  type IntegrationLog,
  type GetIntegrationLogsRequest,
  type TepHeaders,
} from '../../api/transactions';
import { ApiError } from '../../api/apiError';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { Toast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { DropdownBackdrop } from '../shared/DropdownBackdrop';
import { IntegrationLogFileModal } from './IntegrationLogFileModal';

const INITIAL_PAGE_SIZE = 50;
const LOAD_MORE_BATCHES = [25, 50, 200, 500] as const;
// Long enough that mid-typing doesn't fire mid-thought; short enough to feel
// responsive once the user pauses.
const FILTER_DEBOUNCE_MS = 400;

interface FilterFormState {
  endpoint: string;
  statementId: string;
  statusType: string;
  statusCode: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_FILTERS: FilterFormState = {
  endpoint: '',
  statementId: '',
  statusType: '',
  statusCode: '',
  fromDate: '',
  toDate: '',
};

function buildTepHeaders(
  apiKey: string,
  userId: string,
  tepConfig: ReturnType<typeof useTepConfig>,
): TepHeaders {
  return {
    apiKey,
    userId,
    tenantCode: tepConfig.ttpTenantCode,
    languageCode: tepConfig.languageCode,
    timeZone: tepConfig.timeZone,
    requestId: tepConfig.ttpRequestId,
  };
}

function toRequest(form: FilterFormState, pageSize: number): GetIntegrationLogsRequest {
  // Form holds day-grain values (YYYY-MM-DD); the API expects
  // YYYY-MM-DDTHH:mm:ss. Treat the From boundary as start-of-day and the To
  // boundary as end-of-day so the chosen day is fully inclusive.
  const fromIso = form.fromDate ? `${form.fromDate}T00:00:00` : null;
  const toIso = form.toDate ? `${form.toDate}T23:59:59` : null;
  return {
    Endpoint: form.endpoint.trim() || null,
    StatementId: form.statementId.trim() || null,
    StatusType: form.statusType.trim() || null,
    StatusCode: form.statusCode.trim() || null,
    FromDate: fromIso,
    ToDate: toIso,
    Page: 1,
    PageSize: pageSize,
  };
}

function statusBadgeVariant(
  statusType: string | null,
): 'success' | 'danger' | 'warning' | 'info' | 'default' {
  const upper = (statusType ?? '').toUpperCase();
  if (upper === 'SUCCESS') return 'success';
  if (upper === 'ERROR' || upper === 'FAILURE' || upper === 'FAILED') return 'danger';
  if (upper === 'WARNING') return 'warning';
  if (upper === 'INFORMATION' || upper === 'INFO') return 'info';
  return 'default';
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatDuration(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end)) return '';
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ─── Filter pill primitives — match the style used in DynamicFilters.tsx ────

function SearchPill({
  value,
  onChange,
  placeholder,
  width = 'w-44',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  width?: string;
}) {
  const active = value.trim() !== '';
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${width} outline-none ${
          active
            ? 'bg-primary/10 border-primary/30 text-primary-dark placeholder:text-primary-dark/50'
            : 'bg-surface border-border-strong text-body placeholder:text-muted hover:bg-surface-hover'
        }`}
      />
      {active && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-body text-xs"
          aria-label={`Clear ${placeholder}`}
        >
          &times;
        </button>
      )}
    </div>
  );
}

function DateRangePill({
  fromValue,
  toValue,
  onChange,
}: {
  fromValue: string;
  toValue: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = !!fromValue || !!toValue;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          active
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        Date range
        {active && (
          <span className="ml-1 opacity-70">
            ({fromValue || '...'} - {toValue || '...'})
          </span>
        )}
      </button>
      {open && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg p-3 min-w-52">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-muted block mb-0.5">From</label>
                <input
                  type="date"
                  value={fromValue}
                  onChange={(e) => onChange(e.target.value, toValue)}
                  className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body outline-none"
                />
              </div>
              <span className="text-muted text-xs mt-3">&ndash;</span>
              <div className="flex-1">
                <label className="text-[10px] text-muted block mb-0.5">To</label>
                <input
                  type="date"
                  value={toValue}
                  onChange={(e) => onChange(fromValue, e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body outline-none"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function IntegrationLogsTab() {
  const { getAuthHeaders, userId, refreshIfNeeded, isAudit } = useAuth();
  const tepConfig = useTepConfig();
  const { isLiveMode } = useTransactionData();

  const [filters, setFilters] = useState<FilterFormState>(EMPTY_FILTERS);
  const [pageSize, setPageSize] = useState<number>(INITIAL_PAGE_SIZE);

  const [items, setItems] = useState<IntegrationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedLog, setSelectedLog] = useState<IntegrationLog | null>(null);
  const [confirmRerun, setConfirmRerun] = useState<IntegrationLog | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(
    null,
  );

  const abortRef = useRef<AbortController | null>(null);
  const authRef = useRef({ getAuthHeaders, userId, refreshIfNeeded, tepConfig });
  authRef.current = { getAuthHeaders, userId, refreshIfNeeded, tepConfig };

  const fetchWindow = useCallback(async (filtersArg: FilterFormState, sizeArg: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const { getAuthHeaders: gh, userId: uid, refreshIfNeeded: refresh, tepConfig: cfg } =
        authRef.current;
      await refresh();
      const headers = gh();
      const token = headers.Authorization?.replace('Bearer ', '') ?? '';
      if (!token || !uid) return;
      const tepHeaders = buildTepHeaders(
        import.meta.env.VITE_TEP_API_KEY ?? '',
        uid,
        cfg,
      );
      const res = await getIntegrationLogs(
        toRequest(filtersArg, sizeArg),
        token,
        tepHeaders,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setItems(res.Items ?? []);
      setTotal(res.Total ?? 0);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('GetIntegrationLogs failed:', err);
      const message =
        err instanceof ApiError
          ? `${err.message} (HTTP ${err.status})`
          : err instanceof Error
            ? err.message
            : 'Failed to load integration logs';
      setError(message);
      setItems([]);
      setTotal(0);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Live filters: any change resets the window to INITIAL_PAGE_SIZE and refetches,
  // debounced so typing doesn't hammer the API.
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    if (!isLiveMode) return;
    const timer = setTimeout(() => {
      setPageSize(INITIAL_PAGE_SIZE);
      fetchWindow(filters, INITIAL_PAGE_SIZE);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // filtersKey is the content-derived stable dep for filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveMode, filtersKey, fetchWindow]);

  // Load-more: when the user clicks +N, pageSize grows and we refetch the
  // larger window. Skip the run already triggered by the filter effect.
  const isInitialPageRef = useRef(true);
  useEffect(() => {
    if (!isLiveMode) return;
    if (isInitialPageRef.current) {
      isInitialPageRef.current = false;
      return;
    }
    fetchWindow(filters, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const loaded = items.length;
  const remaining = Math.max(0, total - loaded);
  const hasMore = remaining > 0;
  const availableBatches = (() => {
    const batches = LOAD_MORE_BATCHES.filter((b) => b <= remaining);
    if (batches.length === 0 && remaining > 0) return [remaining];
    return batches;
  })();

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
  };

  const handleLoadMore = (extra: number) => {
    setPageSize((s) => s + extra);
  };

  const handleRerun = async () => {
    if (!confirmRerun || isAudit) return;
    const target = confirmRerun;
    setRerunning(true);
    try {
      await refreshIfNeeded();
      const headers = getAuthHeaders();
      const token = headers.Authorization?.replace('Bearer ', '') ?? '';
      if (!token || !userId) throw new Error('Not authenticated');
      const tepHeaders = buildTepHeaders(
        import.meta.env.VITE_TEP_API_KEY ?? '',
        userId,
        tepConfig,
      );
      await rerunIntegrationRequest(target.Id, token, tepHeaders);
      const label = target.StatementId || target.Endpoint || target.Id;
      setToast({ message: `Re-ran call for ${label}`, type: 'success' });
      fetchWindow(filters, pageSize);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to re-run integration request',
        type: 'error',
      });
    } finally {
      setRerunning(false);
      setConfirmRerun(null);
    }
  };

  if (!isLiveMode) {
    return (
      <div className="p-8 text-center text-body-secondary text-sm">
        Integration logs are only available in live mode.
      </div>
    );
  }

  const hasActiveFilters =
    filters.endpoint.trim() !== '' ||
    filters.statementId.trim() !== '' ||
    filters.statusType.trim() !== '' ||
    filters.statusCode.trim() !== '' ||
    filters.fromDate !== '' ||
    filters.toDate !== '';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-heading">Integration Logs</h1>
          <p className="text-xs text-body-secondary mt-0.5">
            Inspect and replay outbound integration calls.
          </p>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-body-secondary">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading…
          </div>
        )}
      </div>

      {/* Filter pill toolbar (live — no Apply). Same look as the Transactions filters. */}
      <div className="flex items-center flex-wrap gap-2">
        <SearchPill
          value={filters.endpoint}
          onChange={(v) => setFilters({ ...filters, endpoint: v })}
          placeholder="Endpoint"
          width="w-56"
        />
        <SearchPill
          value={filters.statementId}
          onChange={(v) => setFilters({ ...filters, statementId: v })}
          placeholder="Statement Id"
          width="w-40"
        />
        <SearchPill
          value={filters.statusType}
          onChange={(v) => setFilters({ ...filters, statusType: v })}
          placeholder="Status type"
          width="w-36"
        />
        <SearchPill
          value={filters.statusCode}
          onChange={(v) => setFilters({ ...filters, statusCode: v })}
          placeholder="Status code"
          width="w-32"
        />
        <DateRangePill
          fromValue={filters.fromDate}
          toValue={filters.toDate}
          onChange={(from, to) => setFilters({ ...filters, fromDate: from, toDate: to })}
        />
        {hasActiveFilters && (
          <button
            onClick={handleReset}
            className="text-xs text-muted hover:text-body underline ml-1"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface-elevated border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-secondary text-[10px] font-semibold uppercase tracking-wider text-body-secondary">
              <tr>
                <th className="text-left px-3 py-2 whitespace-nowrap">Endpoint</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Statement Id</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Start</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Duration</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Status</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Description</th>
                <th className="text-right px-3 py-2 whitespace-nowrap sticky right-0 bg-surface-secondary z-20 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.08)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="border-t border-border animate-pulse">
                    <td className="px-3 py-2"><div className="h-3 w-40 rounded bg-gray-200 dark:bg-gray-700" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-12 rounded bg-gray-200 dark:bg-gray-700" /></td>
                    <td className="px-3 py-2"><div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-48 rounded bg-gray-200 dark:bg-gray-700" /></td>
                    <td className="px-3 py-2 text-right sticky right-0 bg-surface-elevated z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      <div className="h-5 w-20 rounded bg-gray-200 dark:bg-gray-700 inline-block" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-red-600 text-xs">
                    {error}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-body-secondary text-xs">
                    No integration logs match your filters.
                  </td>
                </tr>
              ) : (
                items.map((log) => (
                  <tr
                    key={log.Id}
                    className={`group border-t border-border hover:bg-surface-hover transition-colors ${
                      loading ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-body font-medium">{log.Endpoint}</td>
                    <td className="px-3 py-2 text-body-secondary font-mono text-xs">
                      {log.StatementId}
                    </td>
                    <td className="px-3 py-2 text-body-secondary text-xs whitespace-nowrap">
                      {formatDateTime(log.CallStartDate)}
                    </td>
                    <td className="px-3 py-2 text-body-secondary text-xs whitespace-nowrap">
                      {formatDuration(log.CallStartDate, log.CallEndDate)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {log.StatusType || log.StatusCode ? (
                        <Badge variant={statusBadgeVariant(log.StatusType)} size="sm">
                          {log.StatusType ?? '—'}
                          {log.StatusCode ? ` · ${log.StatusCode}` : ''}
                        </Badge>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-body-secondary text-xs max-w-md truncate">
                      {log.StatusDescription ?? ''}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap sticky right-0 bg-surface-elevated group-hover:bg-surface-hover transition-colors z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {!isAudit && log.Endpoint !== 'ProcessTransactionsForTagging' && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => setConfirmRerun(log)}
                          >
                            Rerun
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setSelectedLog(log)}
                        >
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incremental pagination footer — same pattern as the Transactions tab */}
      {(hasMore || loading) && (
        <div className="flex items-center justify-center gap-3 py-2 mt-1 border border-border bg-surface-secondary rounded-lg">
          {loading ? (
            <div className="flex items-center gap-3 animate-pulse">
              <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ) : (
            <>
              <span className="text-xs text-muted">
                <span className="font-medium text-heading">{loaded.toLocaleString()}</span>
                {' loaded · '}
                <span className="font-medium text-heading">{total.toLocaleString()}</span>
                {' total'}
              </span>
              {hasMore && availableBatches.length > 0 && (
                <>
                  <span className="text-border">|</span>
                  {availableBatches.map((size) => (
                    <Button
                      key={size}
                      variant="outline"
                      size="xs"
                      onClick={() => handleLoadMore(size)}
                    >
                      +{size.toLocaleString()}
                    </Button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {selectedLog && (
        <IntegrationLogFileModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmRerun && !rerunning}
        onClose={() => setConfirmRerun(null)}
        onConfirm={handleRerun}
        title="Re-run integration request"
        message={
          confirmRerun
            ? `This will replay the original request for ${
                confirmRerun.StatementId || confirmRerun.Endpoint
              }. A new log entry will be created. Continue?`
            : ''
        }
        confirmLabel="Re-run now"
        variant="primary"
      />

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
