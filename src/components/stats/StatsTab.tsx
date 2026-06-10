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
import { LibraryExportDialog } from './LibraryExportDialog';
import { LibraryTableModal } from './LibraryTableModal';
import { RollbackConfirmDialog } from './RollbackConfirmDialog';
import { OverflowMenu } from '../shared/OverflowMenu';
import { TaggingStatsCell } from './TaggingStatsCell';
import { TagRuleCard } from '../tagRules/TagRuleCard';
import { CommentsProvider } from '../../context/CommentsContext';
import { CommentIconButton } from '../comments/CommentIconButton';
import { CommentSearchTrigger } from '../comments/CommentSearchTrigger';
import { CommentSearchPanel } from '../comments/CommentSearchPanel';
import type { TepHeaders, BacklogStatEntry, FilterProperty } from '../../api/transactions';
import { getBacklogStats } from '../../api/transactions';
import type { TagSpecLibrary, TagSpecDefinition } from '../../types';
import type { TagSpecCommentTarget } from '../../types/comments';
import { useLocalChanges } from '../../hooks/useLocalChanges';
import { useTransactionData } from '../../hooks/useTransactionData';

interface BacklogNavigationTarget {
  libraryId: string;
  definitionId?: string | null;
  nonce: number;
}

interface StatsTabProps {
  onViewTransactions: (
    bank: string,
    side: string,
    definitionId?: string,
    pillFilters?: FilterProperty[],
  ) => void;
  onViewAllTransactions: () => void;
  onCheckoutComplete: (bank: string, side: string) => void;
  /** Releases a bank/side library checkout. Delegated to App so the
   *  release path stays in lock-step with the header's "Release"
   *  button (same save-then-release call sequence + activeCheckout
   *  cleanup + clearChanges + library refetch). The kebab menu's
   *  Release item routes through this. */
  onRelease: (bank: string, side: string) => void | Promise<void>;
  authToken: string | null;
  tepHeaders: TepHeaders | null;
  /** Set when the user clicked "View in Backlog" from a comment thread.
   *  Expands the matching row, scrolls it into view, and (when defined)
   *  brings the specific TagSpec card into view too. */
  navigation?: BacklogNavigationTarget | null;
  /** Called once the navigation has been processed. */
  onNavigationConsumed?: () => void;
  /** Forwarded to the comment search panel so clicking "View in Backlog"
   *  from a search result's thread reuses the same row-highlight flow. */
  onNavigateToBacklog?: (target: TagSpecCommentTarget) => void;
}

const sideLabel: Record<string, string> = {
  CR: 'Credit',
  DR: 'Debit',
  RC: 'Rev. Credit',
  RD: 'Rev. Debit',
};

/** Backlog row pill identifiers. Mirrors the seven filter recipes specified
 *  by the backend: each click opens the Transactions tab scoped to
 *  bank/side AND the listed FilteringProperties, with `|` in a ColumnName
 *  meaning OR across those columns. AND between separate entries. */
type PillKind =
  | 'clean'
  | 'near-clean'
  | 'problematic-all'
  | 'problematic-missing-mandatory'
  | 'problematic-invalid-attributes'
  | 'problematic-multi-tagged'
  | 'untagged'
  | 'dead-end';

/** Build the FilterProperty[] for a given pill. BankSwiftCode + Side from
 *  the row are NOT included here even though the spec lists them in every
 *  recipe: the Transactions tab already gets them via `activeCheckout` →
 *  `baseFilters` → `translateFilters` (as an `IN` filter), so sending the
 *  pill's `EQ` duplicate adds nothing and actually breaks the Show Only
 *  sync — it can't tell a "context" EQ apart from a "flag" EQ, and the
 *  bank/side EQs accidentally tick the Bank / Side filter chips with the
 *  raw column name. Operands match the spec for the flag conditions —
 *  `NE` for "exclude this state" so the backend doesn't include rows
 *  where the flag is missing. */
function buildPillFilters(kind: PillKind, _bank: string, _side: string): FilterProperty[] {
  const base: FilterProperty[] = [];
  switch (kind) {
    case 'clean':
      return [
        ...base,
        { ColumnName: 'OpsIsUntagged', Value: 'False', Operand: 'EQ' },
        { ColumnName: 'OpsIsDeadEnd', Value: 'False', Operand: 'EQ' },
        { ColumnName: 'OpsIsMultiTag', Value: 'True', Operand: 'NE' },
        { ColumnName: 'OpsIsMissingMandatoryAttributes', Value: 'True', Operand: 'NE' },
        { ColumnName: 'OpsIsMissingOptionalAttributes', Value: 'True', Operand: 'NE' },
        { ColumnName: 'OpsContainsInvalidAttributes', Value: 'True', Operand: 'NE' },
      ];
    case 'near-clean':
      return [
        ...base,
        { ColumnName: 'OpsIsMissingOptionalAttributes', Value: 'True', Operand: 'EQ' },
        { ColumnName: 'OpsIsMissingMandatoryAttributes', Value: 'True', Operand: 'NE' },
        { ColumnName: 'OpsContainsInvalidAttributes', Value: 'True', Operand: 'NE' },
        { ColumnName: 'OpsIsMultiTag', Value: 'True', Operand: 'NE' },
      ];
    case 'problematic-all':
      return [
        ...base,
        {
          ColumnName: 'OpsIsMissingMandatoryAttributes|OpsContainsInvalidAttributes|OpsIsMultiTag',
          Value: 'True',
          Operand: 'EQ',
        },
      ];
    case 'problematic-missing-mandatory':
      return [
        ...base,
        { ColumnName: 'OpsIsMissingMandatoryAttributes', Value: 'True', Operand: 'EQ' },
      ];
    case 'problematic-invalid-attributes':
      return [
        ...base,
        { ColumnName: 'OpsContainsInvalidAttributes', Value: 'True', Operand: 'EQ' },
      ];
    case 'problematic-multi-tagged':
      return [
        ...base,
        { ColumnName: 'OpsIsMultiTag', Value: 'True', Operand: 'EQ' },
      ];
    case 'untagged':
      return [
        ...base,
        { ColumnName: 'OpsIsUntagged', Value: 'True', Operand: 'EQ' },
        { ColumnName: 'OpsIsDeadEnd', Value: 'False', Operand: 'EQ' },
      ];
    case 'dead-end':
      return [
        ...base,
        { ColumnName: 'OpsIsDeadEnd', Value: 'True', Operand: 'EQ' },
      ];
  }
}

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

export function StatsTab({ onViewTransactions, onViewAllTransactions, onCheckoutComplete, onRelease, authToken, tepHeaders, navigation, onNavigationConsumed, onNavigateToBacklog }: StatsTabProps) {
  const { libraries, tagDefinitions, loading, refetchTagSpecs, refetchLibraries, dispatch, taggingProgress, isPairBeingTagged, getTaggingFirstSeen } = useTagSpecs();
  const { usersMap, useDummyData, userId, isAudit } = useAuth();
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
  // Per-library Export picker target. Non-null when the operator clicked
  // the row's Export button — opens a small dialog letting them pick
  // ACTIVE / INPROGRESS / Both, then writes the JSON. Gated upstream on
  // `row.isInProgress` so we always have an INPROGRESS sibling when set.
  const [exportTarget, setExportTarget] = useState<DisplayRow | null>(null);
  // Per-library "View as Table" target. Same visibility gate as export —
  // only meaningful when an INPROGRESS counterpart exists alongside the
  // ACTIVE one (otherwise the existing expanded card list covers the
  // single-library inspection just fine).
  const [tableTarget, setTableTarget] = useState<DisplayRow | null>(null);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);

  // Rows whose checkout state just changed — kept for 5s so the user can
  // visually catch the transition (e.g. "Active" → "In Progress" on checkout).
  const [recentlyChangedKeys, setRecentlyChangedKeys] = useState<Set<string>>(() => new Set());
  const prevRowSignaturesRef = useRef<Map<string, string> | null>(null);
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; duration?: number } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  // Brief cyan glow after navigating from a notification panel so the
  // user can spot the row / TagSpec they just jumped to.
  const [highlightedLibraryId, setHighlightedLibraryId] = useState<string | null>(null);
  const [highlightedDefinitionId, setHighlightedDefinitionId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Detect rows whose checkout-related state just changed (isInProgress,
  // isOwnedByMe, hasOperator, operatorName) and highlight them for 5s. The
  // first render seeds the snapshot without flagging anything so we don't
  // light up every row on mount.
  useEffect(() => {
    const sigOf = (r: DisplayRow) =>
      `${r.isInProgress}|${r.isOwnedByMe}|${r.hasOperator}|${r.operatorName ?? ''}`;
    const current = new Map<string, string>();
    for (const r of rows) current.set(`${r.bank}:${r.side}`, sigOf(r));

    const prev = prevRowSignaturesRef.current;
    prevRowSignaturesRef.current = current;
    if (!prev) return;

    const newlyChanged: string[] = [];
    for (const [key, sig] of current) {
      const prevSig = prev.get(key);
      if (prevSig !== undefined && prevSig !== sig) newlyChanged.push(key);
    }
    if (newlyChanged.length === 0) return;

    setRecentlyChangedKeys((prevSet) => {
      const next = new Set(prevSet);
      for (const k of newlyChanged) next.add(k);
      return next;
    });

    for (const key of newlyChanged) {
      // Reset the 5s window if the row changes again before it expires.
      const existing = highlightTimersRef.current.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setRecentlyChangedKeys((prevSet) => {
          if (!prevSet.has(key)) return prevSet;
          const next = new Set(prevSet);
          next.delete(key);
          return next;
        });
        highlightTimersRef.current.delete(key);
      }, 5000);
      highlightTimersRef.current.set(key, timer);
    }
  }, [rows]);

  // Clean up any pending highlight timers on unmount.
  useEffect(() => {
    const timers = highlightTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

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

  // When the user clicked "View in Backlog" from a comment thread, expand
  // the matching row and bring it (plus the specific TagSpec when provided)
  // into view. Uses rAF so the effect runs after the row has rendered.
  useEffect(() => {
    if (!navigation) return;
    // The comment's libraryId may be either the canonical lib id or the
    // checked-out in-progress copy. Find the library, then derive the
    // bank/side (which is the stable row key) and the canonical id used
    // for the row's React identity / highlight class.
    const target = libraries.find((l) => l.Id === navigation.libraryId);
    if (!target) {
      onNavigationConsumed?.();
      return;
    }
    const bank = getContextValue(target.Context, 'BankSwiftCode') ?? '';
    const side = getContextValue(target.Context, 'Side') ?? '';
    const rowKey = `${bank}:${side}`;
    // Find the canonical (non-in-progress) library for this bank/side, since
    // that is the one the row uses as `row.library.Id` for its key/highlight.
    const canonical = libraries.find(
      (l) =>
        l.StatusTag !== 'INPROGRESS' &&
        getContextValue(l.Context, 'BankSwiftCode') === bank &&
        getContextValue(l.Context, 'Side') === side,
    );
    const rowLibraryId = canonical?.Id ?? target.Id;
    setExpandedRows((prev) => {
      if (prev.has(rowKey)) return prev;
      const next = new Set(prev);
      next.add(rowKey);
      return next;
    });
    const raf1 = requestAnimationFrame(() => {
      const rowEl = document.querySelector(`tr[data-bank-side="${rowKey}"]`);
      rowEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Wait one more frame for the expanded content to mount before scrolling
      // into the specific TagSpec card.
      requestAnimationFrame(() => {
        if (navigation.definitionId) {
          const card = document.querySelector(
            `[data-tagspec-id="${navigation.definitionId}"]`,
          );
          card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setHighlightedLibraryId(rowLibraryId);
        setHighlightedDefinitionId(navigation.definitionId ?? null);
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => {
          setHighlightedLibraryId(null);
          setHighlightedDefinitionId(null);
        }, 2800);
        onNavigationConsumed?.();
      });
    });
    return () => cancelAnimationFrame(raf1);
  }, [navigation, libraries, onNavigationConsumed]);

  // Clean up highlight timer on unmount.
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const handleCheckout = useCallback(async (row: DisplayRow) => {
    const checkoutId = row.inProgressLib?.Id ?? row.library.Id;
    if (!authToken || !tepHeaders || !checkoutId) return;
    setActionLoading(row.library.Id!);
    setToast({ message: `Checking out ${row.bank} / ${row.side}…`, type: 'info', duration: 60_000 });
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

  // Release a checked-out library from the Backlog kebab menu. Routes
  // through App's handleRelease so the save-then-release sequence,
  // activeCheckout cleanup, and library refetch stay identical to
  // the header's own Release button — no duplicate code path that
  // could drift.
  const handleReleaseRow = useCallback(async (row: DisplayRow) => {
    if (!row.inProgressLib?.Id) return;
    setActionLoading(row.library.Id!);
    try {
      await onRelease(row.bank, row.side);
    } finally {
      setActionLoading(null);
    }
  }, [onRelease]);

  const handleCheckin = useCallback(async (row: DisplayRow) => {
    if (!authToken || !tepHeaders || !row.inProgressLib?.Id) return;
    setActionLoading(row.library.Id!);
    setToast({ message: `Checking in ${row.bank} / ${row.side}…`, type: 'info', duration: 60_000 });
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
    setToast({ message: `Rolling back ${rollbackTarget.bank} / ${rollbackTarget.side}…`, type: 'info', duration: 60_000 });
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
          {isLiveMode && (
            <CommentSearchTrigger onClick={() => setSearchPanelOpen(true)} title="Search comments" />
          )}
          {!isAudit && (
            <Button data-tour="backlog-import-button" variant="ghost" size="xs" onClick={() => fileInputRef.current?.click()}>
              Import
            </Button>
          )}
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
        <div data-tour="backlog-table" className="overflow-x-auto overflow-y-clip border border-border rounded-lg custom-scrollbar">
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
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary flex-1 min-w-96 whitespace-nowrap">Action</th>
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
                const isRecentlyChanged = recentlyChangedKeys.has(rowKey);
                const isNavHighlighted = highlightedLibraryId === row.library.Id;
                const libIdForComments = displayLib.Id ?? row.library.Id;
                const rowContent = (
                  <tr key={row.library.Id} className="group" data-library-id={row.library.Id} data-bank-side={rowKey} {...(row.isOwnedByMe ? { 'data-tour': 'my-checkout-row' } : {})}>
                    {row.isOwnedByMe && isRecentlyChanged && (
                      <td data-tour="row-just-checked-out" aria-hidden hidden />
                    )}
                    <td colSpan={8} className="p-0">
                      {/* Main row — sticky when expanded */}
                      <div className={`flex items-start transition-colors duration-500 ${isExpanded ? 'sticky top-8.5 z-10 shadow-sm border-b border-border bg-cyan-50 dark:bg-slate-800 ' : ''} ${row.isInProgress && !isExpanded ? 'bg-primary/5' : isExpanded ? '' : 'hover:bg-surface-hover'} ${isRecentlyChanged ? 'bg-amber-100! dark:bg-amber-500/15! ring-1 ring-inset ring-amber-400/60 dark:ring-amber-500/40' : ''} ${isNavHighlighted ? 'bg-cyan-100! dark:bg-cyan-500/15! ring-2 ring-inset ring-cyan-400/70 dark:ring-cyan-400/60' : ''}`}>
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
                                  <span className={`text-xs font-semibold whitespace-nowrap ${rate === 100 ? 'text-emerald-600 dark:text-emerald-300' : rate >= 90 ? 'text-emerald-500 dark:text-emerald-300' : rate >= 50 ? 'text-amber-600 dark:text-amber-300' : 'text-red-500 dark:text-rose-300'}`}>
                                    {rate.toFixed(1)}%
                                  </span>
                                </div>
                                {/* Badges — each pill is a clickable button that
                                    opens the Transactions tab pre-filtered to
                                    the matching rows. The pill row is wrapped
                                    in a no-op clickable container so the
                                    individual pills can be `<button>` elements
                                    without nesting inside another interactive
                                    parent (the backlog row itself isn't
                                    clickable). Hover styles + cursor-pointer
                                    signal the affordance. */}
                                <div className="flex items-center justify-start pl-27 gap-2 flex-wrap min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => onViewTransactions(row.bank, row.side, undefined, buildPillFilters('clean', row.bank, row.side))}
                                    className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                                    aria-label={`View ${stats.FullyTaggedCount.toLocaleString()} clean transactions`}
                                  >
                                    <Badge variant="emerald" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.FullyTaggedCount.toLocaleString()}</span> Clean</Badge>
                                  </button>
                                  {stats.TaggedWithMissingOptionalAttrCount > 0 && (
                                    <Tooltip
                                      placement="bottom"
                                      content={
                                        <div className="space-y-1.5 min-w-48">
                                          <div className="flex justify-between gap-4">
                                            <span>Missing Optional Att</span>
                                            <span className="font-semibold">{stats.TaggedWithMissingOptionalAttrCount.toLocaleString()}</span>
                                          </div>
                                        </div>
                                      }
                                    >
                                      <button
                                        type="button"
                                        onClick={() => onViewTransactions(row.bank, row.side, undefined, buildPillFilters('near-clean', row.bank, row.side))}
                                        className="cursor-pointer inline-flex transition-transform hover:scale-105 active:scale-95"
                                        aria-label={`View ${stats.TaggedWithMissingOptionalAttrCount.toLocaleString()} near-clean transactions`}
                                      >
                                        <Badge variant="success" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.TaggedWithMissingOptionalAttrCount.toLocaleString()}</span> Near-Clean</Badge>
                                      </button>
                                    </Tooltip>
                                  )}
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
                                      <button
                                        type="button"
                                        onClick={() => onViewTransactions(row.bank, row.side, undefined, buildPillFilters('problematic-all', row.bank, row.side))}
                                        className="cursor-pointer inline-flex transition-transform hover:scale-105 active:scale-95"
                                        aria-label={`View ${stats.IssuesCount.toLocaleString()} problematic transactions`}
                                      >
                                        <Badge variant="amber" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.IssuesCount.toLocaleString()}</span> Problematic</Badge>
                                      </button>
                                    </Tooltip>
                                  )}
                                  {/* Problematic sub-pills — each scopes to a
                                      specific issue category. Rendered only
                                      when their count is non-zero so a fully
                                      tagged library stays uncluttered. */}
                                  {stats.TaggedWithMissingMandatoryAttrCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => onViewTransactions(row.bank, row.side, undefined, buildPillFilters('problematic-missing-mandatory', row.bank, row.side))}
                                      className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                                      aria-label={`View ${stats.TaggedWithMissingMandatoryAttrCount.toLocaleString()} transactions missing mandatory attributes`}
                                    >
                                      <Badge variant="amber" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.TaggedWithMissingMandatoryAttrCount.toLocaleString()}</span> Missing Mandatory</Badge>
                                    </button>
                                  )}
                                  {stats.TaggedWithInvalidAttrCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => onViewTransactions(row.bank, row.side, undefined, buildPillFilters('problematic-invalid-attributes', row.bank, row.side))}
                                      className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                                      aria-label={`View ${stats.TaggedWithInvalidAttrCount.toLocaleString()} transactions with invalid attributes`}
                                    >
                                      <Badge variant="amber" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.TaggedWithInvalidAttrCount.toLocaleString()}</span> Invalid Attributes</Badge>
                                    </button>
                                  )}
                                  {stats.MultiTaggedCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => onViewTransactions(row.bank, row.side, undefined, buildPillFilters('problematic-multi-tagged', row.bank, row.side))}
                                      className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                                      aria-label={`View ${stats.MultiTaggedCount.toLocaleString()} multi-tagged transactions`}
                                    >
                                      <Badge variant="amber" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.MultiTaggedCount.toLocaleString()}</span> Multi-tagged</Badge>
                                    </button>
                                  )}
                                  {stats.UntaggedCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => onViewTransactions(row.bank, row.side, undefined, buildPillFilters('untagged', row.bank, row.side))}
                                      className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                                      aria-label={`View ${stats.UntaggedCount.toLocaleString()} untagged transactions`}
                                    >
                                      <Badge variant="red" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.UntaggedCount.toLocaleString()}</span> Untagged</Badge>
                                    </button>
                                  )}
                                  {stats.DeadEndCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => onViewTransactions(row.bank, row.side, undefined, buildPillFilters('dead-end', row.bank, row.side))}
                                      className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                                      aria-label={`View ${stats.DeadEndCount.toLocaleString()} dead-end transactions`}
                                    >
                                      <Badge variant="gray" size="xs" className="items-baseline!"><span className="text-xs font-medium">{stats.DeadEndCount.toLocaleString()}</span> Dead End</Badge>
                                    </button>
                                  )}
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
                        <div className="px-4 py-2.5 text-end flex-1 min-w-96">
                          <div className="flex items-center justify-end gap-2">
                            {(() => {
                              // Group secondary actions in a single kebab
                              // menu so the row stays scannable. Rollback
                              // is destructive (owner+non-audit only) and
                              // benefits from the extra click before
                              // firing; View as Table / Export only make
                              // sense when an INPROGRESS sibling exists.
                              // The menu renders only when at least one
                              // item qualifies — empty kebabs are noise.
                              const items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; icon?: React.ReactNode }[] = [];
                              // Release sits ABOVE Rollback in the menu —
                              // it's the non-destructive equivalent (drops
                              // the lock, keeps the data) and the more
                              // common choice when an operator hands a
                              // bank/side back without checking in. Only
                              // the operator who owns the checkout can
                              // release it (matches the header's Release
                              // button visibility); audit role cannot
                              // mutate checkouts at all.
                              if (row.isOwnedByMe && !isAudit) {
                                items.push({
                                  label: 'Release',
                                  disabled: isBeingTagged || isLoading,
                                  onClick: () => { void handleReleaseRow(row); },
                                });
                                items.push({
                                  label: 'Rollback',
                                  danger: true,
                                  disabled: isBeingTagged || isLoading,
                                  onClick: () => setRollbackTarget(row),
                                });
                              }
                              if (row.isInProgress) {
                                items.push({
                                  label: 'View as Table',
                                  disabled: isLoading,
                                  onClick: () => setTableTarget(row),
                                });
                                items.push({
                                  label: 'Export',
                                  disabled: isLoading,
                                  onClick: () => setExportTarget(row),
                                });
                              }
                              if (items.length === 0) return null;
                              return (
                                <OverflowMenu
                                  data-tour="backlog-rollback-button"
                                  disabled={isBeingTagged || isLoading}
                                  triggerTitle={taggingLockTitle}
                                  items={items}
                                />
                              );
                            })()}
                            {row.isOwnedByMe && !isAudit && (
                              <Button data-tour="backlog-checkin-button" variant="primary" size="xs" onClick={() => handleCheckin(row)} disabled={isBeingTagged} loading={isLoading} title={taggingLockTitle}>
                                Checkin
                              </Button>
                            )}
                            {(!row.isInProgress || (row.isInProgress && !row.hasOperator)) && !isAudit && (
                              <Button
                                data-tour="checkout-button"
                                variant="primary"
                                size="xs"
                                onClick={() => handleCheckout(row)}
                                disabled={!canAct || isBeingTagged}
                                loading={isLoading}
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
                            {/* Export and View as Table moved into the
                                OverflowMenu above — the action row was
                                getting too crowded to render any of them
                                on a single line. */}
                            <Button data-tour="backlog-transactions-button" variant="outline" size="xs" onClick={() => onViewTransactions(row.bank, row.side)} disabled={isLoading}>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                              </svg>
                              Transactions
                            </Button>
                            {libIdForComments && (
                              <CommentIconButton
                                target={{ TagSpecLibraryId: libIdForComments }}
                                targetLabel={`${bankNameMap.get(row.bank) ?? row.bank} · ${row.side}`}
                                size="xs"
                                title="Comments on this bank/side"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Expanded definitions */}
                      {isExpanded && (() => {
                        const changedIds = getChangedDefIds(row);
                        // Tag-name alphabetical sort is the operator's
                        // anchor when scanning a library's contents —
                        // requested explicitly. Changed definitions keep
                        // a soft "top of group" priority so the diff
                        // affordance still surfaces, but within each
                        // group (changed vs unchanged) tags read A-to-Z
                        // case-insensitively, with the definition Id as
                        // a tiebreaker so two same-named tags stay
                        // stable across re-renders.
                        const sorted = [...definitions].sort((a, b) => {
                          const aChanged = changedIds.has(a.Id) ? 0 : 1;
                          const bChanged = changedIds.has(b.Id) ? 0 : 1;
                          if (aChanged !== bChanged) return aChanged - bChanged;
                          const tagCmp = (a.Tag ?? '').localeCompare(b.Tag ?? '', undefined, { sensitivity: 'base' });
                          if (tagCmp !== 0) return tagCmp;
                          return (a.Id ?? '').localeCompare(b.Id ?? '');
                        });
                        return (
                          <div className="border-t border-border-subtle bg-surface-secondary/50 px-6 py-4">
                            {sorted.length === 0 ? (
                              <p className="text-sm text-faint text-center py-4">No tag definitions in this library.</p>
                            ) : (
                              <div className="space-y-3">
                                {sorted.map((def) => {
                                  const isDefHighlighted = highlightedDefinitionId === def.Id;
                                  const wrapperClass = isDefHighlighted
                                    ? 'rounded-lg ring-2 ring-cyan-400/70 dark:ring-cyan-400/60 shadow-[0_0_0_4px_rgba(34,211,238,0.18)] transition-all duration-500'
                                    : changedIds.has(def.Id)
                                      ? 'rounded-lg ring-1 ring-amber-300 bg-amber-50/40 dark:bg-amber-900/10 dark:ring-amber-700'
                                      : '';
                                  return (
                                  <div key={def.Id} className={wrapperClass}>
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
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
                return libIdForComments ? (
                  <CommentsProvider
                    key={row.library.Id}
                    libraryId={libIdForComments}
                    authToken={authToken}
                    tepHeaders={tepHeaders}
                    eager={isExpanded}
                  >
                    {rowContent}
                  </CommentsProvider>
                ) : (
                  rowContent
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RollbackConfirmDialog
        open={!!rollbackTarget}
        bankCode={rollbackTarget?.bank ?? ''}
        side={rollbackTarget?.side ?? ''}
        loading={!!rollbackTarget && actionLoading === rollbackTarget.library.Id}
        onClose={() => setRollbackTarget(null)}
        onConfirm={handleRollbackConfirm}
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
          onTagClick={(def) => {
            const bank = compareTarget.bank;
            const side = compareTarget.side;
            setCompareTarget(null);
            onViewTransactions(bank, side, def.Id);
          }}
        />
      )}

      {exportTarget && exportTarget.inProgressLib && (
        <LibraryExportDialog
          open
          onClose={() => setExportTarget(null)}
          activeLib={exportTarget.library}
          inProgressLib={exportTarget.inProgressLib}
          bank={exportTarget.bank}
          side={exportTarget.side}
          bankLabel={bankNameMap.get(exportTarget.bank)}
        />
      )}

      {tableTarget && tableTarget.inProgressLib && (
        <LibraryTableModal
          open
          onClose={() => setTableTarget(null)}
          activeLib={tableTarget.library}
          inProgressLib={tableTarget.inProgressLib}
          bank={tableTarget.bank}
          side={tableTarget.side}
          bankLabel={bankNameMap.get(tableTarget.bank)}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} duration={toast.duration} onClose={() => setToast(null)} />
      )}

      <CommentSearchPanel
        open={searchPanelOpen}
        target={null}
        onClose={() => setSearchPanelOpen(false)}
        onNavigateToBacklog={onNavigateToBacklog}
      />
    </div>
  );
}
