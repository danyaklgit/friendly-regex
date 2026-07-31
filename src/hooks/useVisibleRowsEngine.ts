import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { TransactionRow } from '../types';
import type { FilterProperty, SortProperty } from '../api/transactions';
import { PAGE_SIZE } from '../context/TransactionDataContext';

/**
 * How the hidden-tag (dual NI query) path grows the buffer on an
 * incremental +N / Show all / classic page nav:
 *
 * - `'append'` (default): fetch the next PageSize-50 page(s) of the
 *   NI-excluded set with the SAME two `NI` filter properties as extra
 *   filters and APPEND them — consistent with the plain path. This relies
 *   on the backend paginating the NI-filtered result set correctly beyond
 *   page 0 (pagination applied AFTER filtering, same mechanism the plain
 *   page-index path already uses).
 * - `'replace'`: fall back to a single `{PageIndex:0, PageSize:target}`
 *   NI-excluded re-fetch that REPLACES the buffer (the pre-append
 *   behavior). Flip here if the backend does NOT paginate the NI-excluded
 *   set correctly (page N returns wrong / overlapping rows).
 *
 * The plain path (no hidden tags) always appends on incremental grow.
 */
const HIDDEN_TAG_PAGINATION: 'append' | 'replace' = 'append';

/** Page indices (0-based) needed to grow a page-aligned buffer of
 *  `haveRows` up to at least `wantRows`, at PAGE_SIZE per page. Returns the
 *  first not-yet-loaded page through the last page covering `wantRows`.
 *  `haveRows` is page-aligned in practice — appends only fire while
 *  `have < want <= total`, so every prior page was full (a short page only
 *  occurs at the dataset end, after which the buffer-satisfies short
 *  circuit stops further fetches). */
function pageIndicesToGrow(haveRows: number, wantRows: number): number[] {
  const from = Math.floor(haveRows / PAGE_SIZE);
  const to = Math.ceil(wantRows / PAGE_SIZE) - 1;
  const out: number[] = [];
  for (let p = from; p <= to; p++) out.push(p);
  return out;
}

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
 * (verified 230/250). Typical hide = the NI data call + a parallel
 * PageSize-1 no-exclusion scope count (which refreshes
 * `totalTransactionsCount`); the header tally is then
 * `totalTransactionsCount - visibleTotal`. NOTE: rows
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
  /** Fetch specific PageSize-50 page indices and APPEND them to the buffer
   *  (no replace). Used for incremental +N / Show all / classic page nav so
   *  a +50 click fires `{PageIndex:next, PageSize:50}` and grows the buffer
   *  instead of re-fetching a bigger page 0. */
  appendBatch: (
    filters: Record<string, Set<string>>,
    pageIndices: number[],
    extraFilters?: FilterProperty[],
    sortingProperties?: SortProperty[],
    signal?: AbortSignal,
  ) => Promise<TransactionRow[]>;
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
  ensureVisible: (target: number, opts?: { forceFetch?: boolean; bulk?: boolean }) => Promise<void>;
  /** Filter-change / Refresh path: reset the window to PAGE_SIZE (50) and
   *  reload page 0. Discards any prior +N / Show all window. */
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

  // Single-flight for the APPEND path. `appendBatch` (unlike
  // `replaceFromBeginning`) has no internal abortRef, so the engine owns
  // one: every ensureVisibleWithIds entry aborts the pending append before
  // planning the next fetch. Without this, a +N append that resolves AFTER
  // a superseding filter-change REPLACE would splice stale rows onto the
  // new buffer (the append commits inside appendBatch). Aborting cancels
  // the fetch BEFORE its commit, so partial rows are discarded.
  const appendAbortRef = useRef<AbortController | null>(null);

  // Filters epoch: bumps whenever the filter scope identity changes
  // (render-time check). Used to key the EXACT visible total so a stale
  // measurement from a previous scope is never trusted.
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

  const ensureVisibleWithIds = useCallback(async (
    target: number,
    opts: { forceFetch?: boolean; bulk?: boolean; hiddenIdsOverride?: ReadonlySet<string> } = {},
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
    // Any pending APPEND is now stale — cancel it before planning this
    // fetch so its late commit can't splice old-scope rows onto the buffer
    // this call is about to (re)build.
    appendAbortRef.current?.abort();
    appendAbortRef.current = null;
    // `hiddenIdsOverride` carries the post-hide/unhide set: the notify
    // call runs in the same tick as setHiddenDefIds, before the new prop
    // lands.
    const ids = opts.hiddenIdsOverride ?? argsRef.current.hiddenDefIds;
    const key = `${filtersEpochRef.current}:${[...ids].sort().join('|')}`;
    // A load is FRESH (replace page 0) vs INCREMENTAL. Fresh: an explicit
    // forceFetch (filter change / Refresh / tag-save / unhide) OR a
    // scope/hidden-set change (key mismatch, e.g. a hide) OR an empty
    // buffer. `opts.bulk` (Show all / classic page nav) also takes the
    // replace path: those can request a huge window, and one
    // `{PageIndex:0, PageSize:N}` request is far cheaper than N/50 parallel
    // page appends. Only the +N button (non-bulk incremental grow) APPENDS
    // the delta pages at PageSize 50, so a +50 fires
    // `{PageIndex:next, PageSize:50}` and the new batch is appended.
    const a0 = argsRef.current;
    const isFresh = !!opts.forceFetch || bufferKeyRef.current !== key || a0.transactions.length === 0;
    const useAppend = !isFresh && !opts.bulk;

    // ---- DUAL-QUERY PATH (hidden tags active): server-side exclusion ----
    if (ids.size > 0) {
      // The dual fetch returns the EXACT visible total AND refreshes
      // totalTransactionsCount with the no-exclusion scope total, so the
      // hidden tally (totalTransactionsCount - visibleTotal) needs no
      // separate count call.
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
      const extras = a.activeExtraFilters.length > 0 ? a.activeExtraFilters : undefined;

      // INCREMENTAL grow of an existing NI-excluded buffer: append the next
      // page(s) of the excluded set (same two NI filters as extra filters).
      // Relies on the backend paginating the NI-filtered result correctly
      // beyond page 0 — toggle HIDDEN_TAG_PAGINATION to 'replace' to fall
      // back to a grow+replace if it doesn't.
      if (useAppend && HIDDEN_TAG_PAGINATION === 'append') {
        const have = a.transactions.length;
        const pages = pageIndicesToGrow(have, clamped);
        if (pages.length === 0) {
          setRefilling(false);
          return;
        }
        setRefilling(true);
        const hiddenValue = [...ids].join('|');
        const niExtras: FilterProperty[] = [
          ...(extras ?? []),
          { ColumnName: 'OpsTagSpecDefinitionId', Value: hiddenValue, Operand: 'NI' },
          { ColumnName: 'OpsMultiTags.TagSpecDefinitionId', Value: hiddenValue, Operand: 'NI' },
        ];
        const controller = new AbortController();
        appendAbortRef.current = controller;
        await a.appendBatch(a.outgoingFilters, pages, niExtras, a.effectiveSorting, controller.signal);
        if (appendAbortRef.current === controller) appendAbortRef.current = null;
        if (token === runRef.current) setRefilling(false);
        return;
      }

      // FRESH (or replace-mode fallback): re-fetch page 0 at PageSize
      // `clamped`, REPLACE the buffer, and capture the exact visible total.
      setRefilling(true);
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

    // ---- PLAIN PATH (no hidden tags) ----
    // No hidden rows to exclude, so fetching `clamped` rows yields exactly
    // `clamped` visible rows.
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

    // INCREMENTAL grow: append the next PageSize-50 page(s) — a +50 click
    // sends `{PageIndex:next, PageSize:50}` and the new batch is appended,
    // not a bigger page 0 replacing the buffer.
    if (useAppend) {
      const have = a.transactions.length;
      const pages = pageIndicesToGrow(have, clamped);
      if (pages.length === 0) {
        setRefilling(false);
        return;
      }
      setRefilling(true);
      const controller = new AbortController();
      appendAbortRef.current = controller;
      await a.appendBatch(a.outgoingFilters, pages, extras, a.effectiveSorting, controller.signal);
      if (appendAbortRef.current === controller) appendAbortRef.current = null;
      if (token === runRef.current) setRefilling(false);
      return;
    }

    // FRESH: page 0 at PageSize `clamped`, REPLACE the buffer.
    setRefilling(true);
    await a.replaceFromBeginning(a.outgoingFilters, clamped, extras, a.effectiveSorting);
    if (token === runRef.current) {
      bufferKeyRef.current = key;
      setRefilling(false);
    }
  }, []);

  const ensureVisible = useCallback(
    (target: number, opts?: { forceFetch?: boolean; bulk?: boolean }) =>
      ensureVisibleWithIds(target, { forceFetch: opts?.forceFetch, bulk: opts?.bulk }),
    [ensureVisibleWithIds],
  );

  // Filter change / Refresh / tag-save: RESET the window to the initial
  // PAGE_SIZE (50) and reload page 0. The operator re-paginates from a
  // clean first page with +N; a prior +N / Show all window is intentionally
  // discarded so a scope change never re-fetches a bigger page 0
  // (`{PageIndex:0, PageSize:100}`) — the exact behavior this rework
  // removes. (Hide/unhide use their own targets via notifyHiddenSetChanged,
  // not refetch.)
  const refetch = useCallback(
    () => ensureVisibleWithIds(PAGE_SIZE, { forceFetch: true }),
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
    if (!argsRef.current.isLiveMode) return; // sample counts derive client-side
    if (kind === 'unhideAll' || next.size === 0) {
      // Hidden rows were excluded SERVER-SIDE, so the buffer doesn't
      // contain them — refetch to bring them back. Unhiding resets the
      // window to the initial PAGE_SIZE (50): the operator is returning to
      // a clean view, so any prior +N / Show all window is discarded.
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
    targetVisibleRef.current = PAGE_SIZE;
    setTargetVisible(PAGE_SIZE);
    visibleTotalRef.current = null;
    setVisibleTotalState(null);
    bufferKeyRef.current = '';
    setRefilling(false);
  }, [args.checkoutBank, args.checkoutSide]);

  const { isLiveMode, totalTransactionsCount, hiddenDefIds, hiddenLoadedCount } = args;

  // Visible-space total. Server-side exclusion makes the visible total
  // EXACT: with no hidden tags it's the plain scope total
  // (`totalTransactionsCount`); with hidden tags it's `visibleTotalState`
  // (the dual fetch's tagged + untagged TransactionsCount sum) as long as
  // it was measured for the current scope + hidden set. Until a dual fetch
  // lands for this key it reads null (the display layer clamps
  // totalNow >= loadedNow). Never derived from the loaded-buffer length —
  // that shifts while the async analyzeRow pass walks a fresh buffer.
  const totalShowing = useMemo(() => {
    if (!isLiveMode) return null;
    if (hiddenDefIds.size === 0) return totalTransactionsCount;
    const key = `${filtersEpochRef.current}:${[...hiddenDefIds].sort().join('|')}`;
    if (visibleTotalState?.key === key) return visibleTotalState.value;
    return null; // visible total not measured yet for this scope/hidden set
  }, [isLiveMode, totalTransactionsCount, hiddenDefIds, visibleTotalState]);

  // Hidden tally = main-load total minus the hide response's visible total.
  // `totalTransactionsCount` is the no-exclusion scope total (the plain
  // load sets it; the dual fetch refreshes it from its third count so it
  // stays correct even after a filter change while tags are hidden), and
  // `totalShowing` is the dual fetch's visible total — so the difference of
  // the two fetch responses is exactly the hidden count.
  const totalHidden = useMemo(() => {
    if (!isLiveMode) return hiddenLoadedCount;
    if (hiddenDefIds.size === 0) return 0;
    const fullTotal = totalTransactionsCount;
    const visible = totalShowing;
    if (fullTotal == null || visible == null) return 0;
    return Math.max(0, fullTotal - visible);
  }, [isLiveMode, hiddenDefIds, totalTransactionsCount, totalShowing, hiddenLoadedCount]);

  return {
    targetVisible,
    totalShowing,
    totalHidden,
    // Pulse the header tally while a hide-scoped refill is resolving the
    // visible total; no separate count call backs it anymore.
    hiddenCountLoading: refilling && hiddenDefIds.size > 0,
    refilling,
    ensureVisible,
    refetch,
    resetTargetVisible,
    notifyHiddenSetChanged,
  };
}
