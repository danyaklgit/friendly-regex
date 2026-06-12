import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { TransactionRow } from '../types';
import type { FilterProperty, SortProperty } from '../api/transactions';
import { PAGE_SIZE } from '../context/TransactionDataContext';

/**
 * Visible-rows engine: keeps the loaded prefix buffer big enough that the
 * table always shows `targetVisible` VISIBLE rows (rows not matching a
 * hidden tag spec), as long as the visible total permits. One primitive —
 * `ensureVisible(target)` — serves every consumer: initial load and
 * filter-change refetches (`refetch`), incremental +N / Show all, the
 * post-hide refill, and classic page navigation.
 *
 * When tag specs are hidden, exclusion happens SERVER-SIDE via
 * `replaceFromBeginningExcluding`: a single query carrying TWO `NI`
 * filter properties (`OpsTagSpecDefinitionId` and
 * `OpsMultiTags.TagSpecDefinitionId`). This is the payload the backend
 * honors — it drops rows hidden by their primary OR any multi-tag and
 * keeps untagged rows, so the buffer contains exactly the visible rows
 * (PageSize = target) and `TransactionsCount` is the EXACT visible total.
 * The earlier single COMPOSITE column leaked multi-tagged hidden rows
 * (verified 230/250). Typical hide = one data call + a background
 * unfiltered-count call (header tally = unfiltered - visible). NOTE: rows
 * that are multi-tagged with a MIX of hidden and visible defs are kept by
 * the server (they have a visible tag); TransactionsTab strips the hidden
 * defs from those rows' DISPLAY (badges/attributes) via
 * `displayAnalyzedData`. Unhiding resets the window to PAGE_SIZE. Full
 * design: docs/superpowers/specs/2026-06-12-hidden-tags-refill-design.md.
 */

export interface VisibleRowsEngineArgs {
  isLiveMode: boolean;
  transactions: TransactionRow[];
  totalTransactionsCount: number | null;
  fetchCount: (
    filters: Record<string, Set<string>>,
    extraFilters?: FilterProperty[],
    sortingProperties?: SortProperty[],
    signal?: AbortSignal,
  ) => Promise<number | null>;
  replaceFromBeginning: (
    filters: Record<string, Set<string>>,
    pageSize: number,
    extraFilters?: FilterProperty[],
    sortingProperties?: SortProperty[],
  ) => Promise<TransactionRow[]>;
  replaceFromBeginningExcluding: (
    filters: Record<string, Set<string>>,
    pageSize: number,
    hiddenDefIds: string[],
    extraFilters?: FilterProperty[],
    sortingProperties?: SortProperty[],
  ) => Promise<{ rows: TransactionRow[]; visibleTotal: number | null } | null>;
  outgoingFilters: Record<string, Set<string>>;
  activeExtraFilters: FilterProperty[];
  effectiveSorting: SortProperty[];
  hiddenDefIds: Set<string>;
  /** Client-side (analyzeRow) count of loaded rows that are hidden.
   *  Display floor while the scoped count call is in flight, and the
   *  whole hidden tally in sample mode. */
  hiddenLoadedCount: number;
  /** Sample-mode visible slice setter (`setVisibleCount`). */
  setSampleVisibleCount: (count: number) => void;
  checkoutBank: string | null;
  checkoutSide: string | null;
}

export interface VisibleRowsEngine {
  /** User-intended visible row count (fetch floor, not a display cap). */
  targetVisible: number;
  /** Visible-space total for the active filter scope. Null until the
   *  first server total lands (live mode only). */
  totalShowing: number | null;
  /** Scoped count of rows matching hidden definitions. */
  totalHidden: number;
  hiddenCountLoading: boolean;
  /** True while a refill (count and/or data call) is in flight. */
  refilling: boolean;
  ensureVisible: (target: number, opts?: { forceFetch?: boolean }) => Promise<void>;
  /** Filter-change path: re-ensure the persisted target against a stale buffer. */
  refetch: () => Promise<void>;
  /** Drop the +N / Show all intent back to the default page size WITHOUT
   *  fetching — the caller's filter reset triggers the refetch (Refresh
   *  button's clean-slate contract). */
  resetTargetVisible: () => void;
  notifyHiddenSetChanged: (
    next: Set<string>,
    kind: 'hide' | 'unhide' | 'unhideAll',
    previousVisibleShown: number,
  ) => void;
}

export function useVisibleRowsEngine(args: VisibleRowsEngineArgs): VisibleRowsEngine {
  // Latest-args ref, updated during render (same pattern as the share
  // filter refs in TransactionsTab) so every async callback reads the
  // values of the most recent commit without churning its own identity —
  // identity churn here would re-fire the live-fetch effect (gotcha #16).
  const argsRef = useRef(args);
  argsRef.current = args;

  // User-intended visible row count. Always starts at PAGE_SIZE on mount
  // and is NOT persisted: leaving the Transactions tab (which unmounts it)
  // and coming back resets the view to the initial 50, regardless of how
  // far the operator had paginated. Within a tab session the value is
  // carried by `targetVisibleRef` (a ref) so filter changes / Refresh keep
  // the current window; only an unmount drops it. (Hidden tag specs DO
  // persist across tab nav via sessionStorage — that's a separate concern,
  // gotcha #1.)
  const [targetVisible, setTargetVisible] = useState<number>(PAGE_SIZE);
  const targetVisibleRef = useRef(targetVisible);

  // Scoped hidden-row count for the CURRENT filter scope. Null = unknown
  // (not yet fetched for this scope). Kept at its last value while a
  // refresh is in flight so the header doesn't flash 0.
  const [hiddenTotal, setHiddenTotal] = useState<number | null>(
    args.hiddenDefIds.size === 0 ? 0 : null,
  );
  const hiddenTotalRef = useRef<number | null>(hiddenTotal);
  const [hiddenCountLoading, setHiddenCountLoading] = useState(false);
  const [refilling, setRefilling] = useState(false);

  // EXACT visible total from the last dual-query fetch (sum of the two
  // response counts), keyed by the scope + hidden set it was measured
  // for. Authoritative for totalShowing while the key matches; a scope
  // or hidden-set change falls back to the subtraction estimate until
  // the next dual fetch lands.
  const [visibleTotalState, setVisibleTotalState] = useState<{ key: string; value: number } | null>(null);
  const visibleTotalRef = useRef(visibleTotalState);
  // Provenance of the loaded buffer: which scope + hidden set it was
  // fetched under. A dual-path "buffer already satisfies the target"
  // short circuit is only valid when this matches the current key —
  // a buffer fetched under a different hidden set is mixed/incomplete.
  const bufferKeyRef = useRef('');

  // Monotonic run token: every ensureVisible / refetch / hidden-set change
  // bumps it, and awaited continuations bail when stale. One mechanism for
  // rapid hide/hide/unhide, filter changes mid-refill, and checkout
  // switches. Data-call single-flight itself is enforced by
  // replaceFromBeginning's abortRef.
  const runRef = useRef(0);

  // Count-call cache: key = filters epoch + sorted hidden ids. The epoch
  // bumps whenever the filter scope identity changes (render-time check —
  // a double render just costs one redundant count call).
  const countCacheKeyRef = useRef('');
  const countAbortRef = useRef<AbortController | null>(null);
  const filtersEpochRef = useRef(0);
  const lastFilterIdsRef = useRef<{ f: unknown; e: unknown; s: unknown }>({ f: null, e: null, s: null });
  if (
    lastFilterIdsRef.current.f !== args.outgoingFilters ||
    lastFilterIdsRef.current.e !== args.activeExtraFilters ||
    lastFilterIdsRef.current.s !== args.effectiveSorting
  ) {
    lastFilterIdsRef.current = { f: args.outgoingFilters, e: args.activeExtraFilters, s: args.effectiveSorting };
    filtersEpochRef.current++;
  }

  /** Resolves the UNFILTERED scope total (active filters, NO hidden
   *  exclusion) so the header "N hidden" chip = unfilteredTotal -
   *  visibleTotal. Server-side exclusion makes the visible total exact;
   *  the hidden tally is just the complement. Cached per filter epoch
   *  (it doesn't depend on which tags are hidden). Stored in the
   *  `hiddenTotal` slot, which the derived `totalHidden` subtracts from.
   *  Returns null when a newer run took over mid-flight. */
  const resolveUnfilteredTotal = useCallback(async (token: number): Promise<number | null> => {
    const key = `epoch:${filtersEpochRef.current}`;
    if (key === countCacheKeyRef.current && hiddenTotalRef.current != null) {
      return hiddenTotalRef.current;
    }
    countAbortRef.current?.abort();
    const controller = new AbortController();
    countAbortRef.current = controller;
    setHiddenCountLoading(true);
    let count: number | null = null;
    try {
      const a = argsRef.current;
      count = await a.fetchCount(
        a.outgoingFilters,
        a.activeExtraFilters.length > 0 ? a.activeExtraFilters : undefined,
        a.effectiveSorting,
        controller.signal,
      );
    } finally {
      if (countAbortRef.current === controller) setHiddenCountLoading(false);
    }
    if (token !== runRef.current) return null;
    if (count == null) return hiddenTotalRef.current ?? null;
    hiddenTotalRef.current = count;
    setHiddenTotal(count);
    countCacheKeyRef.current = key;
    return count;
  }, []);

  const ensureVisibleWithIds = useCallback(async (
    target: number,
    opts: { forceFetch?: boolean; hiddenIdsOverride?: ReadonlySet<string> } = {},
  ): Promise<void> => {
    const clamped = Math.max(PAGE_SIZE, Math.floor(target) || 0);
    targetVisibleRef.current = clamped;
    setTargetVisible(clamped);
    if (!argsRef.current.isLiveMode) {
      // Sample mode is pure client slicing — no fetch planning needed.
      argsRef.current.setSampleVisibleCount(clamped);
      return;
    }
    const token = ++runRef.current;
    // `hiddenIdsOverride` carries the post-hide/unhide set: the notify
    // call runs in the same tick as setHiddenDefIds, before the new prop
    // lands.
    const ids = opts.hiddenIdsOverride ?? argsRef.current.hiddenDefIds;
    const key = `${filtersEpochRef.current}:${[...ids].sort().join('|')}`;

    // ---- DUAL-QUERY PATH (hidden tags active): server-side exclusion ----
    if (ids.size > 0) {
      // Header tally (unfiltered total) refreshes in the background; the
      // data path doesn't need it (the NI fetch returns the exact visible
      // total itself).
      void resolveUnfilteredTotal(token);
      const a = argsRef.current;
      // Buffer already satisfies the target? Only trust a buffer fetched
      // under the SAME scope + hidden set — its rows are all visible, so
      // its length IS the visible count.
      if (!opts.forceFetch && bufferKeyRef.current === key) {
        const have = a.transactions.length;
        const vt = visibleTotalRef.current?.key === key ? visibleTotalRef.current.value : null;
        if (have >= clamped || (vt != null && have >= vt)) {
          setRefilling(false);
          return;
        }
      }
      setRefilling(true);
      const extras = a.activeExtraFilters.length > 0 ? a.activeExtraFilters : undefined;
      const res = await a.replaceFromBeginningExcluding(
        a.outgoingFilters,
        clamped,
        [...ids],
        extras,
        a.effectiveSorting,
      );
      if (token !== runRef.current) return;
      if (res == null) {
        // Aborted superseded fetch or transport error.
        setRefilling(false);
        return;
      }
      bufferKeyRef.current = key;
      if (res.visibleTotal != null) {
        const next = { key, value: res.visibleTotal };
        visibleTotalRef.current = next;
        setVisibleTotalState(next);
      }
      setRefilling(false);
      return;
    }

    // ---- PLAIN PATH (no hidden tags): single exact-size fetch ----
    // No hidden rows to exclude, so fetching `clamped` rows yields exactly
    // `clamped` visible rows. Reset the hidden tally to 0.
    hiddenTotalRef.current = 0;
    setHiddenTotal(0);
    const a = argsRef.current;
    const serverTotal = a.totalTransactionsCount;
    const extras = a.activeExtraFilters.length > 0 ? a.activeExtraFilters : undefined;

    // Buffer already satisfies the target (e.g. a prior +N loaded more)?
    // Only trust a buffer fetched under THIS scope key (an unhide-all
    // leaves a visible-only buffer keyed to the prior hidden set).
    if (!opts.forceFetch && bufferKeyRef.current === key) {
      const have = a.transactions.length;
      if (have >= clamped || (serverTotal != null && have >= serverTotal)) {
        setRefilling(false);
        return;
      }
    }
    setRefilling(true);
    await a.replaceFromBeginning(a.outgoingFilters, clamped, extras, a.effectiveSorting);
    if (token === runRef.current) {
      bufferKeyRef.current = key;
      setRefilling(false);
    }
  }, [resolveUnfilteredTotal]);

  const ensureVisible = useCallback(
    (target: number, opts?: { forceFetch?: boolean }) =>
      ensureVisibleWithIds(target, { forceFetch: opts?.forceFetch }),
    [ensureVisibleWithIds],
  );

  const refetch = useCallback(
    () => ensureVisibleWithIds(targetVisibleRef.current, { forceFetch: true }),
    [ensureVisibleWithIds],
  );

  const resetTargetVisible = useCallback(() => {
    targetVisibleRef.current = PAGE_SIZE;
    setTargetVisible(PAGE_SIZE);
  }, []);

  // Explicitly invoked from the hide/unhide handlers — NOT a useEffect
  // watching hiddenDefIds. Explicit calls carry intent (hide vs unhide
  // need different work) and keep the no-phantom-calls discipline.
  const notifyHiddenSetChanged = useCallback((
    next: Set<string>,
    kind: 'hide' | 'unhide' | 'unhideAll',
    previousVisibleShown: number,
  ) => {
    countCacheKeyRef.current = '';
    if (!argsRef.current.isLiveMode) return; // sample counts derive client-side
    if (kind === 'unhideAll' || next.size === 0) {
      // Hidden rows were excluded SERVER-SIDE, so the buffer doesn't
      // contain them — refetch to bring them back. Unhiding resets the
      // window to the initial PAGE_SIZE (50): the operator is returning to
      // a clean view, so any prior +N / Show all window is discarded.
      countAbortRef.current?.abort();
      hiddenTotalRef.current = 0;
      setHiddenTotal(0);
      setHiddenCountLoading(false);
      visibleTotalRef.current = null;
      setVisibleTotalState(null);
      setRefilling(true);
      void ensureVisibleWithIds(PAGE_SIZE, {
        hiddenIdsOverride: next,
        forceFetch: true,
      });
      return;
    }
    if (kind === 'unhide') {
      // The restored definition's rows were excluded by the NI fetch, so a
      // fresh fetch (under the smaller hidden set) is required. Like
      // unhide-all, reset the window to the initial PAGE_SIZE (50) even if
      // more rows were loaded — unhiding returns the operator to a clean
      // starting view.
      setRefilling(true);
      void ensureVisibleWithIds(PAGE_SIZE, {
        hiddenIdsOverride: next,
        forceFetch: true,
      });
      return;
    }
    // hide: refill back to what the operator was looking at. Never SHRINK
    // the persisted target — a classic-mode hide on page 1 must not
    // overwrite a prior Show-all / +N window with the page size. Flag the
    // refill immediately so the footer indicator covers the whole flow
    // (ensureVisible's exit paths clear it). The key mismatch (new hidden
    // set) makes the dual path skip its buffer short circuit.
    setRefilling(true);
    void ensureVisibleWithIds(
      Math.max(targetVisibleRef.current, PAGE_SIZE, previousVisibleShown),
      { hiddenIdsOverride: next },
    );
  }, [ensureVisibleWithIds]);

  // Checkout change = new session: reset the target and counts, cancel
  // in-flight work. Mirrors the hiddenDefIds wipe in TransactionsTab
  // (mount-time restore is the lazy initializer's job, so skip the
  // first run).
  const lastCheckoutRef = useRef<{ bank: string | null; side: string | null }>({
    bank: args.checkoutBank,
    side: args.checkoutSide,
  });
  useEffect(() => {
    const prev = lastCheckoutRef.current;
    if (prev.bank === args.checkoutBank && prev.side === args.checkoutSide) return;
    lastCheckoutRef.current = { bank: args.checkoutBank, side: args.checkoutSide };
    runRef.current++;
    countAbortRef.current?.abort();
    countCacheKeyRef.current = '';
    targetVisibleRef.current = PAGE_SIZE;
    setTargetVisible(PAGE_SIZE);
    hiddenTotalRef.current = 0;
    setHiddenTotal(0);
    setHiddenCountLoading(false);
    visibleTotalRef.current = null;
    setVisibleTotalState(null);
    bufferKeyRef.current = '';
    setRefilling(false);
  }, [args.checkoutBank, args.checkoutSide]);

  // Abort the pending count call on unmount (data calls are owned and
  // aborted by TransactionDataContext).
  useEffect(() => () => { countAbortRef.current?.abort(); }, []);

  const { isLiveMode, totalTransactionsCount, hiddenDefIds, hiddenLoadedCount } = args;

  // Visible-space total. With hidden tags active, the EXACT number from
  // the last dual-query fetch wins (sum of the two response counts) as
  // long as it was measured for the current scope + hidden set; until a
  // dual fetch lands for this key, fall back to the same-scope
  // subtraction estimate. Floored at 0, never on the loaded-buffer
  // visible count — that number shifts while the async analyzeRow pass
  // walks a fresh buffer (displayCounts clamps totalNow >= loadedNow at
  // the display layer instead).
  // Server-side exclusion makes the visible total EXACT: with no hidden
  // tags it's the plain scope total (`totalTransactionsCount`); with
  // hidden tags it's `visibleTotalState` (the NI fetch's TransactionsCount
  // for the current scope+hidden key). `hiddenTotal` now holds the
  // UNFILTERED scope total (see resolveUnfilteredTotal), so the hidden
  // tally is just the complement: unfiltered - visible.
  const totalShowing = useMemo(() => {
    if (!isLiveMode) return null;
    if (hiddenDefIds.size === 0) return totalTransactionsCount;
    const key = `${filtersEpochRef.current}:${[...hiddenDefIds].sort().join('|')}`;
    if (visibleTotalState?.key === key) return visibleTotalState.value;
    return null; // visible total not measured yet for this scope/hidden set
  }, [isLiveMode, totalTransactionsCount, hiddenDefIds, visibleTotalState]);

  const totalHidden = useMemo(() => {
    if (!isLiveMode) return hiddenLoadedCount;
    if (hiddenDefIds.size === 0) return 0;
    const unfiltered = hiddenTotal;
    const visible = totalShowing;
    if (unfiltered == null || visible == null) return 0;
    return Math.max(0, unfiltered - visible);
  }, [isLiveMode, hiddenDefIds, hiddenTotal, totalShowing, hiddenLoadedCount]);

  return {
    targetVisible,
    totalShowing,
    totalHidden,
    hiddenCountLoading,
    refilling,
    ensureVisible,
    refetch,
    resetTargetVisible,
    notifyHiddenSetChanged,
  };
}
