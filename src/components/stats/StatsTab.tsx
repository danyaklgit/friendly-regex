import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useAuth } from '../../context/AuthContext';
import { getContextValue } from '../../types/tagSpec';
import { tagSpecLibraryCheckOut, tagSpecLibraryCheckIn, tagSpecLibraryRollback } from '../../api/checkout';
import { tagSpecLibrarySave } from '../../api/tagSpecSave';
import { exportTagLibraries, exportSingleDefinition, importTagLibraries } from '../../utils/persistence';
import { Badge } from '../shared/Badge';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Toast } from '../shared/Toast';
import { Tooltip } from '../shared/Tooltip';
import { ComparisonModal } from './ComparisonModal';
import { TaggingStatsCell } from './TaggingStatsCell';
import { TagRuleCard } from '../tagRules/TagRuleCard';
import type { TepHeaders, BacklogStatEntry } from '../../api/transactions';
import { getBacklogStats } from '../../api/transactions';
import type { TagSpecLibrary, TagSpecDefinition } from '../../types';
import { useLocalChanges } from '../../hooks/useLocalChanges';
import { useTransactionData } from '../../hooks/useTransactionData';

interface StatsTabProps {
  onViewTransactions: (bank: string, side: string, definitionId?: string) => void;
  onViewAllTransactions: () => void;
  onCheckoutComplete: (bank: string, side: string) => void;
  authToken: string | null;
  tepHeaders: TepHeaders | null;
}

const sideLabel: Record<string, string> = {
  CR: 'Credit',
  DR: 'Debit',
  RC: 'Rev. Credit',
  RD: 'Rev. Debit',
};

interface DisplayRow {
  library: TagSpecLibrary;
  bank: string;
  side: string;
  operatorName: string | null;
  isInProgress: boolean;
  isOwnedByMe: boolean;
  hasOperator: boolean;
  inProgressLib: TagSpecLibrary | undefined;
}

export function StatsTab({ onViewTransactions, onViewAllTransactions, onCheckoutComplete, authToken, tepHeaders }: StatsTabProps) {
  const { libraries, tagDefinitions, loading, refetchTagSpecs, refetchLibraries, dispatch, taggingProgress, isPairBeingTagged, getTaggingFirstSeen } = useTagSpecs();
  const { usersMap, useDummyData, userId } = useAuth();
  const { clearChanges } = useLocalChanges(undefined, undefined);
  const { filterDefinitions, filterDefinitionsLoading, fetchFilterDefinitions, isLiveMode } = useTransactionData();

  // Fetch filter definitions on mount so bank names are available even when starting on Backlog
  useEffect(() => {
    if (isLiveMode && filterDefinitions.length === 0 && !filterDefinitionsLoading) {
      fetchFilterDefinitions();
    }
  }, [isLiveMode, filterDefinitions.length, filterDefinitionsLoading, fetchFilterDefinitions]);

  // Build bank code → display name map from filter definitions
  const bankNameMap = useMemo(() => {
    const map = new Map<string, string>();
    const bankDef = filterDefinitions.find((d) => d.Values.some((v) => v.Column === 'BankSwiftCode'));
    if (bankDef) {
      for (const v of bankDef.Values) {
        if (v.Value && v.Label) map.set(v.Value, v.Label);
      }
    }
    return map;
  }, [filterDefinitions]);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<DisplayRow | null>(null);
  const [compareTarget, setCompareTarget] = useState<DisplayRow | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Tag rule management state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; tag: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [backlogStats, setBacklogStats] = useState<Map<string, BacklogStatEntry>>(new Map());
  const [statsLoading, setStatsLoading] = useState(false);

  const refetchBacklogStats = useCallback(async () => {
    if (!authToken || !tepHeaders) return;
    try {
      const stats = await getBacklogStats('MT940', authToken, tepHeaders);
      const map = new Map<string, BacklogStatEntry>();
      for (const s of stats) map.set(s.TagSpecLibraryId, s);
      setBacklogStats(map);
    } catch (err) {
      console.error('Failed to refetch backlog stats:', err);
    }
  }, [authToken, tepHeaders]);

  // Refresh after a write action: pulls libraries + TaggingProgress (lightweight — no
  // hierarchy) and backlog stats once. The delayed retry at ~2.5s only pulls libraries
  // since backlog stats don't change that fast. Used for checkout.
  const refreshAfterAction = useCallback(() => {
    refetchLibraries();
    refetchBacklogStats();
    const id = setTimeout(() => { refetchLibraries(); }, 2500);
    return () => clearTimeout(id);
  }, [refetchLibraries, refetchBacklogStats]);

  // Aggressive post-action refresh for checkin/rollback — these trigger a backend tagging
  // job whose creation latency varies (sometimes immediate, sometimes 10-20s). We fire
  // GetTagSpecLibraries (lightweight) at a staggered schedule covering a 30-second window
  // so the new TaggingProgress entry appears without the user needing to manually refresh.
  // Backlog stats are fetched once up front; the delayed retries only pull libraries +
  // TaggingProgress since Clean/Issues/Untagged counts don't change while we're waiting
  // for the tagging entry to appear.
  const refreshAfterTaggingTrigger = useCallback(() => {
    refetchLibraries();
    refetchBacklogStats();
    const delays = [2_500, 7_000, 15_000, 30_000];
    const timers = delays.map((d) =>
      setTimeout(() => { refetchLibraries(); }, d),
    );
    return () => timers.forEach(clearTimeout);
  }, [refetchLibraries, refetchBacklogStats]);

  // Background refetch on mount (fires each time user navigates to Backlog tab)
  useEffect(() => {
    if (useDummyData) return;
    refetchTagSpecs();

    // Fetch backlog stats
    if (authToken && tepHeaders) {
      let cancelled = false;
      setStatsLoading(true);
      getBacklogStats('MT940', authToken, tepHeaders).then((stats) => {
        if (cancelled) return;
        const map = new Map<string, BacklogStatEntry>();
        for (const s of stats) map.set(s.TagSpecLibraryId, s);
        setBacklogStats(map);
      }).catch((err) => console.error('Failed to fetch backlog stats:', err))
        .finally(() => { if (!cancelled) setStatsLoading(false); });
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When tagging finishes (all IN_PROGRESS entries disappear), refresh backlog stats
  // so the Clean/Issues/Untagged counts reflect the newly tagged transactions.
  const hadActiveTaggingRef = useRef(false);
  useEffect(() => {
    const hasActive = Object.values(taggingProgress).some((e) => e.Status === 'IN_PROGRESS');
    if (hadActiveTaggingRef.current && !hasActive) {
      refetchBacklogStats();
    }
    hadActiveTaggingRef.current = hasActive;
  }, [taggingProgress, refetchBacklogStats]);

  const rows = useMemo<DisplayRow[]>(() => {
    const referencedIds = new Set(
      libraries.filter(l => l.ActiveTagSpecLibId && l.StatusTag === 'ACTIVE').map(l => l.ActiveTagSpecLibId!)
    );

    const activeLibs = libraries.filter(
      l => l.StatusTag === 'ACTIVE' && l.Id && !referencedIds.has(l.Id)
    );

    const unsorted = activeLibs.map(lib => {
      const inProgressLib = libraries.find(
        l => l.ActiveTagSpecLibId === lib.Id && l.StatusTag === 'INPROGRESS'
      );
      const hasOperator = !!inProgressLib?.OperatorId;
      return {
        library: lib,
        bank: getContextValue(lib.Context, 'BankSwiftCode') ?? '',
        side: getContextValue(lib.Context, 'Side') ?? '',
        operatorName: hasOperator
          ? usersMap.get(inProgressLib!.OperatorId) ?? inProgressLib!.OperatorId
          : null,
        isInProgress: !!inProgressLib,
        hasOperator,
        isOwnedByMe: hasOperator && inProgressLib!.OperatorId === userId,
        inProgressLib,
      };
    });

    // Sort: my checkouts first, then other users' checkouts, then the rest.
    // Within each bucket, sort alphabetically by bank name.
    const bucketOrder = (r: DisplayRow) =>
      r.isOwnedByMe ? 0 : (r.isInProgress && r.hasOperator) ? 1 : 2;

    return unsorted.sort((a, b) => {
      const bucket = bucketOrder(a) - bucketOrder(b);
      if (bucket !== 0) return bucket;
      return a.bank.localeCompare(b.bank);
    });
  }, [libraries, usersMap, userId]);

  // Order-stable list of library Ids that currently have a tagging job (IN_PROGRESS or FAILED).
  // Used to show a "1 of N" position pill on each TaggingStatsCell.
  const taggingJobOrder = useMemo(() => {
    return Object.values(taggingProgress)
      .filter((e) => e.Status === 'IN_PROGRESS' || e.Status === 'FAILED')
      .sort((a, b) => new Date(a.StartedAt).getTime() - new Date(b.StartedAt).getTime())
      .map((e) => e.TagSpecLibraryId);
  }, [taggingProgress]);

  const handleRetryTagging = useCallback(() => {
    // Retry endpoint isn't wired on the backend yet — surface a friendly message for now so
    // the UI is testable. Swap this for a real API call once the endpoint is available.
    setToast({ message: 'Retry is not yet supported by the backend. Please contact support.', type: 'error' });
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCheckout = useCallback(async (row: DisplayRow) => {
    const checkoutId = row.inProgressLib?.Id ?? row.library.Id;
    if (!authToken || !tepHeaders || !checkoutId) return;
    setActionLoading(row.library.Id!);
    try {
      await tagSpecLibraryCheckOut(checkoutId, authToken, tepHeaders);
      refreshAfterAction();
      setToast({ message: `Checked out ${row.bank} / ${row.side}`, type: 'success' });
      onCheckoutComplete(row.bank, row.side);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Checkout failed', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  }, [authToken, tepHeaders, refreshAfterAction, onCheckoutComplete]);

  const handleCheckin = useCallback(async (row: DisplayRow) => {
    if (!authToken || !tepHeaders || !row.inProgressLib?.Id) return;
    setActionLoading(row.library.Id!);
    try {
      await tagSpecLibrarySave(row.inProgressLib, authToken, tepHeaders);
      await tagSpecLibraryCheckIn(row.inProgressLib.Id, authToken, tepHeaders);
      clearChanges(row.bank, row.side);
      refreshAfterTaggingTrigger();
      setToast({ message: `Checked in ${row.bank} / ${row.side}`, type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Check-in failed', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  }, [authToken, tepHeaders, refreshAfterTaggingTrigger, clearChanges]);

  const handleRollbackConfirm = useCallback(async () => {
    if (!authToken || !tepHeaders || !rollbackTarget?.inProgressLib?.Id) return;
    setActionLoading(rollbackTarget.library.Id!);
    try {
      await tagSpecLibraryRollback(rollbackTarget.inProgressLib.Id, authToken, tepHeaders);
      clearChanges(rollbackTarget.bank, rollbackTarget.side);
      refreshAfterTaggingTrigger();
      setToast({ message: `Rolled back ${rollbackTarget.bank} / ${rollbackTarget.side}`, type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Rollback failed', type: 'error' });
    } finally {
      setActionLoading(null);
      setRollbackTarget(null);
    }
  }, [authToken, tepHeaders, rollbackTarget, refreshAfterTaggingTrigger, clearChanges]);

  // --- Tag rule CRUD ---

  const handleEditTag = useCallback((def: TagSpecDefinition, parentLib?: TagSpecLibrary) => {
    if (!parentLib) return;
    const bank = getContextValue(parentLib.Context, 'BankSwiftCode') ?? '';
    const side = getContextValue(parentLib.Context, 'Side') ?? '';
    onViewTransactions(bank, side, def.Id);
  }, [onViewTransactions]);

  const handleDeleteTag = useCallback((id: string) => {
    const def = tagDefinitions.find((d) => d.Id === id);
    if (def) setDeleteTarget({ id, tag: def.Tag });
  }, [tagDefinitions]);

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      dispatch({ type: 'DELETE', payload: { definitionId: deleteTarget.id } });
      setDeleteTarget(null);
    }
  }, [deleteTarget, dispatch]);

  const handleExportAll = useCallback(() => {
    exportTagLibraries(libraries);
  }, [libraries]);

  const handleExportSingle = useCallback((def: TagSpecDefinition, parentLib?: TagSpecLibrary) => {
    if (parentLib) {
      exportSingleDefinition(def, parentLib);
    }
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importTagLibraries(file);
      dispatch({ type: 'IMPORT', payload: imported });
      const count = imported.reduce((sum, lib) => sum + lib.TagSpecDefinitions.length, 0);
      setToast({ message: `Imported ${count} tag definition(s)`, type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to import: ' + (err instanceof Error ? err.message : 'Invalid file'), type: 'error' });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [dispatch]);

  // Get the display library for a row (prefer INPROGRESS for showing definitions)
  const getDisplayLib = useCallback((row: DisplayRow): TagSpecLibrary => {
    return row.inProgressLib ?? row.library;
  }, []);

  // Compute set of definition IDs that are new or modified vs the ACTIVE baseline
  const getChangedDefIds = useCallback((row: DisplayRow): Set<string> => {
    if (!row.inProgressLib) return new Set();
    const baseById = new Map(row.library.TagSpecDefinitions.map(d => [d.Id, d]));
    const changed = new Set<string>();
    for (const def of row.inProgressLib.TagSpecDefinitions) {
      const baseDef = baseById.get(def.Id);
      if (!baseDef || JSON.stringify(baseDef) !== JSON.stringify(def)) {
        changed.add(def.Id);
      }
    }
    return changed;
  }, []);

  const getStats = useCallback((row: DisplayRow): BacklogStatEntry | undefined => {
    // Try matching on the ACTIVE library ID first, then INPROGRESS
    return backlogStats.get(row.library.Id!) ?? (row.inProgressLib?.Id ? backlogStats.get(row.inProgressLib.Id) : undefined);
  }, [backlogStats]);

  const canAct = !useDummyData && !!authToken && !!tepHeaders;

  // Show loading skeleton only on initial load (no data yet)
  const showSkeleton = loading && libraries.length === 0;

  return (
    <div data-tour="backlog-view">
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Check out a Tag Spec Library to start.
        </span>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <Button data-tour="backlog-import-button" variant="ghost" size="xs" onClick={() => fileInputRef.current?.click()}>
            Import
          </Button>
          <Button
            data-tour="backlog-export-all-button"
            variant="secondary"
            size="xs"
            onClick={handleExportAll}
            disabled={tagDefinitions.length === 0}
          >
            Export All
          </Button>
          <Button data-tour="backlog-view-all-button" variant="primary" size="xs" onClick={onViewAllTransactions}>
            View All Transactions
          </Button>
        </div>
      </div>

      {showSkeleton ? (
        <div className="text-center py-12 text-body-secondary text-sm">Loading libraries...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">No active libraries found.</div>
      ) : (
        <div data-tour="backlog-table" className="overflow-clip border border-border rounded-lg">
          <table className="min-w-full divide-y divide-divide">
            <thead className="bg-surface-secondary sticky top-0 z-20">
              <tr className="flex items-center">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-10 shrink-0 whitespace-nowrap"></th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-44 shrink-0 whitespace-nowrap">Bank</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-24 shrink-0 whitespace-nowrap">Side</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-16 shrink-0 whitespace-nowrap">Rules</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary flex-1 min-w-72 whitespace-nowrap">Statistics</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-40 shrink-0 whitespace-nowrap">Operator</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-body-secondary w-24 shrink-0 whitespace-nowrap">Status</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary flex-1 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-divide">
              {rows.map((row) => {
                const isLoading = actionLoading === row.library.Id;
                const rowKey = `${row.bank}:${row.side}`;
                const isExpanded = expandedRows.has(rowKey);
                const displayLib = getDisplayLib(row);
                const definitions = displayLib.TagSpecDefinitions;
                const stats = getStats(row);
                const isBeingTagged = isPairBeingTagged(row.library) || isPairBeingTagged(row.inProgressLib);
                const taggingEntry =
                  (row.library.Id ? taggingProgress[row.library.Id] : undefined) ??
                  (row.inProgressLib?.Id ? taggingProgress[row.inProgressLib.Id] : undefined) ??
                  (row.inProgressLib?.ActiveTagSpecLibId ? taggingProgress[row.inProgressLib.ActiveTagSpecLibId] : undefined);
                const taggingLockTitle = isBeingTagged ? 'Tagging in progress' : undefined;
                return (
                  <tr key={row.library.Id} className="group">
                    <td colSpan={8} className="p-0">
                      {/* Main row — sticky when expanded */}
                      <div className={`flex items-start transition-colors ${isExpanded ? 'sticky top-8.5 z-10 shadow-sm border-b border-border bg-cyan-50 dark:bg-slate-800 ' : ''} ${row.isInProgress && !isExpanded ? 'bg-primary/5' : isExpanded ? '' : 'hover:bg-surface-hover'}`}>
                        {/* Expand toggle */}
                        <div className="px-4 py-2.5 w-10 shrink-0">
                          <button
                            type="button"
                            data-tour="expand-first-row"
                            onClick={() => toggleExpand(rowKey)}
                            className="text-faint hover:text-body-secondary cursor-pointer"
                          >
                            <svg
                              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                        {/* Bank */}
                        <div className="px-4 py-2.5 text-xs font-medium text-heading w-44 shrink-0 cursor-pointer select-none" onClick={() => toggleExpand(rowKey)}>{bankNameMap.get(row.bank) ?? row.bank}</div>
                        {/* Side */}
                        <div className="px-4 py-2.5 w-24 shrink-0">
                          <Badge variant={row.side === 'CR' ? 'emerald' : row.side === 'DR' ? 'red' : 'default'} size="xs">
                            {row.side} {sideLabel[row.side] ? `- ${sideLabel[row.side]}` : ''}
                          </Badge>
                        </div>
                        {/* Rules count */}
                        <div className="px-4 py-2.5 text-xs text-body-secondary text-center w-16 shrink-0">
                          {definitions.length}
                        </div>
                        {/* Statistics */}
                        <div data-tour="backlog-statistics" className="px-4 py-2 flex-1 min-w-72 min-h-16">
                          {taggingEntry && (taggingEntry.Status === 'IN_PROGRESS' || taggingEntry.Status === 'FAILED') ? (
                            (() => {
                              const position = taggingJobOrder.indexOf(taggingEntry.TagSpecLibraryId);
                              return (
                                <TaggingStatsCell
                                  entry={taggingEntry}
                                  firstSeenAt={getTaggingFirstSeen(taggingEntry.TagSpecLibraryId)}
                                  jobPosition={position >= 0 ? position + 1 : undefined}
                                  jobCount={taggingJobOrder.length}
                                  onRetry={taggingEntry.Status === 'FAILED' ? handleRetryTagging : undefined}
                                />
                              );
                            })()
                          ) : statsLoading ? (
                            <div className="space-y-1.5">
                              <div className="h-2 w-full rounded-full bg-surface-tertiary animate-pulse" />
                              <div className="flex gap-3">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <div key={i} className="h-3 w-12 rounded bg-surface-tertiary animate-pulse" />
                                ))}
                              </div>
                            </div>
                          ) : stats ? (() => {
                            const rate = stats.TaggingRate;
                            return (
                              <div className="space-y-1.5 py-0.5">
                                {/* Progress bar with label */}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-body-secondary whitespace-nowrap min-w-25 font-semibold">{stats.TotalTransactionCount.toLocaleString()} txns</span>
                                  <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-surface-tertiary">
                                    <div
                                      className={`h-full rounded-full transition-all ${rate === 100 ? 'bg-emerald-500' : rate >= 90 ? 'bg-emerald-400' : rate >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                                      style={{ width: `${rate}%` }}
                                    />
                                  </div>
                                  <span className={`text-xs font-semibold whitespace-nowrap ${rate === 100 ? 'text-emerald-600' : rate >= 90 ? 'text-emerald-500' : rate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                                    {rate.toFixed(1)}%
                                  </span>
                                </div>
                                {/* Badges */}
                                <div className="flex items-center justify-start pl-27 gap-2 flex-wrap">
                                  <div className='flex items-center gap-2'>
                                  <Badge variant="emerald" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.FullyTaggedCount.toLocaleString()}</span> Clean</Badge>
                                  {stats.IssuesCount > 0 && (
                                    <Tooltip
                                      placement="bottom"
                                      content={
                                        <div className="space-y-1.5 min-w-48">
                                          <div className="flex justify-between gap-4">
                                            <span>Missing Mandatory Attr</span>
                                            <span className="font-semibold">{stats.TaggedWithMissingMandatoryAttrCount.toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span>Missing Optional Attr</span>
                                            <span className="font-semibold">{stats.TaggedWithMissingOptionalAttrCount.toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span>Invalid Attr</span>
                                            <span className="font-semibold">{stats.TaggedWithInvalidAttrCount.toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span>Multi-Tagged</span>
                                            <span className="font-semibold">{stats.MultiTaggedCount.toLocaleString()}</span>
                                          </div>
                                          <div className="border-t border-gray-200 dark:border-gray-600 pt-1.5 mt-1 text-[10px] text-muted italic">
                                            A transaction may appear in multiple categories
                                          </div>
                                        </div>
                                      }
                                    >
                                      <span className="cursor-help inline-flex">
                                        <Badge variant="amber" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.IssuesCount.toLocaleString()}</span> Issues</Badge>
                                      </span>
                                    </Tooltip>
                                  )}
                                  {stats.UntaggedCount > 0 && (
                                    <Badge variant="red" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.UntaggedCount.toLocaleString()}</span> Untagged</Badge>
                                  )}
                                  {stats.DeadEndCount > 0 && (
                                    <Badge variant="gray" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.DeadEndCount.toLocaleString()}</span> Dead End</Badge>
                                  )}
                                  </div>
                                </div>
                              </div>
                            );
                          })() : (
                            <span className="text-[10px] text-faint">No stats</span>
                          )}
                        </div>
                        {/* Operator */}
                        <div className="px-4 py-2.5 text-xs text-body-secondary w-40 shrink-0 truncate">
                          {row.operatorName
                            ? <span className="text-primary-dark font-medium">{row.operatorName}</span>
                            : <span className="text-faint">-</span>}
                        </div>
                        {/* Status */}
                        <div data-tour="backlog-status" className="px-4 py-2.5 text-center w-24 shrink-0">
                          <Badge variant={row.isInProgress ? 'emerald' : 'primary'} size="xs">
                            {row.isInProgress ? 'In Progress' : 'Active'}
                          </Badge>
                        </div>
                        {/* Actions */}
                        <div className="px-4 py-2.5 text-end flex-1">
                          <div className="flex items-center justify-end gap-2">
                            {row.isOwnedByMe && (
                              <Button data-tour="backlog-rollback-button" variant="danger_ghost" size="xs" onClick={() => setRollbackTarget(row)} disabled={isLoading || isBeingTagged} title={taggingLockTitle}>
                                Rollback
                              </Button>
                            )}
                            {row.isOwnedByMe && (
                              <Button data-tour="backlog-checkin-button" variant="primary" size="xs" onClick={() => handleCheckin(row)} disabled={isLoading || isBeingTagged} title={taggingLockTitle}>
                                Checkin
                              </Button>
                            )}
                            {(!row.isInProgress || (row.isInProgress && !row.hasOperator)) && (
                              <Button
                                data-tour="checkout-button"
                                variant="primary"
                                size="xs"
                                onClick={() => handleCheckout(row)}
                                disabled={!canAct || isLoading || isBeingTagged}
                                title={taggingLockTitle}
                              >
                                Checkout
                              </Button>
                            )}
                            {row.isInProgress && (
                              <Button data-tour="backlog-compare-button" variant="outline" size="xs" onClick={() => setCompareTarget(row)} disabled={isLoading || isBeingTagged} title={taggingLockTitle}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M2 10a8 8 0 018-8v16a8 8 0 01-8-8z" opacity="0.4" />
                                  <path d="M10 2a8 8 0 018 8 8 8 0 01-8 8V2z" />
                                </svg>
                                Compare
                              </Button>
                            )}
                            <Button data-tour="backlog-transactions-button" variant="outline" size="xs" onClick={() => onViewTransactions(row.bank, row.side)} disabled={isLoading}>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                              </svg>
                              Transactions
                            </Button>
                          </div>
                        </div>
                      </div>
                      {/* Expanded definitions */}
                      {isExpanded && (() => {
                        const changedIds = getChangedDefIds(row);
                        const sorted = [...definitions].sort((a, b) => {
                          const aChanged = changedIds.has(a.Id) ? 0 : 1;
                          const bChanged = changedIds.has(b.Id) ? 0 : 1;
                          return aChanged - bChanged;
                        });
                        return (
                          <div className="border-t border-border-subtle bg-surface-secondary/50 px-6 py-4">
                            {sorted.length === 0 ? (
                              <p className="text-sm text-faint text-center py-4">No tag definitions in this library.</p>
                            ) : (
                              <div className="space-y-3">
                                {sorted.map((def) => (
                                  <div key={def.Id} className={changedIds.has(def.Id) ? 'rounded-lg ring-1 ring-amber-300 bg-amber-50/40 dark:bg-amber-900/10 dark:ring-amber-700' : ''}>
                                    <TagRuleCard
                                      definition={def}
                                      parentLib={displayLib}
                                      onEdit={handleEditTag}
                                      onDelete={handleDeleteTag}
                                      onExport={handleExportSingle}
                                      onViewTransactions={handleEditTag}
                                      readOnly={!row.isOwnedByMe || isBeingTagged}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!rollbackTarget}
        onClose={() => setRollbackTarget(null)}
        onConfirm={handleRollbackConfirm}
        title="Rollback Changes"
        message={`Are you want to roll back to the production version of ${rollbackTarget?.bank ?? ''} / ${rollbackTarget?.side ?? ''} ? This cannot be undone.`}
        confirmLabel="Rollback"
        variant="danger_ghost"
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Tag Rule"
        message={`Are you sure you want to delete the tag "${deleteTarget?.tag}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger_ghost"
      />

      {compareTarget && compareTarget.inProgressLib && (
        <ComparisonModal
          open
          onClose={() => setCompareTarget(null)}
          activeLib={compareTarget.library}
          inProgressLib={compareTarget.inProgressLib}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
