import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { TransactionRow } from '../types';
import type { FilterProperty, SortProperty } from '../api/transactions';
import { PAGE_SIZE, type AppendBatchOptions } from '../context/TransactionDataContext';

/**
 * Server page size for incremental +N APPENDS. Requests on this endpoint
 * cost ~376 ms fixed (a full count per call) + ~0.77 ms per row, so ~500
 * rows per page amortizes the fixed cost without turning a +500 into ten
 * parallel counts. The buffer therefore grows in 500-aligned steps and can
 * over-satisfy the display target — later +N clicks then resolve instantly
 * from the buffer (the `targetVisible` slice in TransactionsTab keeps the
 * DISPLAY literal). Page indices in `loadedPagesRef` are in this size's
 * space.
 */
const APPEND_PAGE_SIZE = 500;

/** Pages (at APPEND_PAGE_SIZE) fully covered by a freshly REPLACED buffer
 *  of `rowCount` rows. A partial trailing page is NOT marked: the next
 *  append re-fetches it and the id-dedupe in appendBatch drops the overlap
 *  (a one-time cost that keeps arbitrary, non-page-aligned replace sizes
 *  correct without any length→index math). */
function seedLoadedPages(rowCount: number): Set<number> {
  const pages = new Set<number>();
  for (let p = 0; (p + 1) * APPEND_PAGE_SIZE <= rowCount; p++) pages.add(p);
  return pages;
}

/** Page indices needed to grow the buffer to at least `wantRows` raw rows:
 *  every page from 0 through the one covering `wantRows` that isn't loaded
 *  yet. Pages are always fetched contiguously from 0, so this is a
 *  contiguous run starting at the first unloaded page. */
function pagesToGrow(loaded: ReadonlySet<number>, wantRows: number): number[] {
  const last = Math.ceil(wantRows / APPEND_PAGE_SIZE) - 1;
  const out: number[] = [];
  for (let p = 0; p <= last; p++) {
    if (!loaded.has(p)) out.push(p);
  }
  return out;
}

/** First page (at APPEND_PAGE_SIZE) not yet loaded — the append cursor. */
function nextUnloadedPage(loaded: ReadonlySet<number>): number {
  let p = 0;
  while (loaded.has(p)) p++;
  return p;
}

/** The two NI exclusion properties for the hidden-tag path — TWO separate
 *  columns, never the composite (gotcha #2). */
function buildNiFilters(ids: ReadonlySet<string>): FilterProperty[] {
  const hiddenValue = [...ids].join('|');
  return [
    { ColumnName: 'OpsTagSpecDefinitionId', Value: hiddenValue, Operand: 'NI' },
    { ColumnName: 'OpsMultiTags.TagSpecDefinitionId', Value: hiddenValue, Operand: 'NI' },
  ];
}

/**
 * Visible-rows engine: keeps the loaded prefix buffer big enough that the
 * table always shows `targetVisible` VISIBLE rows (rows not matching a
 * hidden tag spec), as long as the visible total permits. One primitive —
 * `ensureVisible(target)` — serves the incremental consumers: initial load
 * and filter-change refetches (`refetch`), incremental +N / Show all, and
 * the post-hide refill. Classic (normal) page nav uses `goToPage(k)`, which
 * fetches exactly one page (`{PageIndex:k, PageSize:50}`) instead of a
 * growing prefix.
 *
 * INCREMENTAL +N clicks APPEND only the missing pages (`appendBatch`,
 * ~500-row chunks with explicit page indices from `loadedPagesRef`) — a
 * grow never re-downloads rows the buffer already holds. FRESH loads
 * (filter change / Refresh / hide / empty or non-prefix buffer) and BULK
 * grows (`Show all`, passed as `opts.bulk`) still REPLACE via a single
 * `{PageIndex:0, PageSize:target}` request: one request beats hundreds of
 * paged appends because every request pays a fixed full-count cost, and a
 * parallel appended Show-all would put hundreds of concurrent counts on
 * the database.
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
  /** Fetch specific APPEND_PAGE_SIZE pages and APPEND them to the buffer
   *  (id-deduped, guard-checked commit — see TransactionDataContext). Used
   *  by incremental +N so a grow fetches only the rows it doesn't have. */
  appendBatch: (
    filters: Record<string, Set<string>>,
    pageIndices: number[],
    opts?: AppendBatchOptions,
  ) => Promise<{ rows: TransactionRow[]; totalCount: number | null } | null>;
  replaceFromBeginning: (
    filters: Record<string, Set<string>>,
    pageSize: number,
    extraFilters?: FilterProperty[],
    sortingProperties?: SortProperty[],
    pageIndex?: number,
  ) => Promise<TransactionRow[]>;
  replaceFromBeginningExcluding: (
    filters: Record<string, Set<string>>,
    pageSize: number,
    hiddenDefIds: string[],
    extraFilters?: FilterProperty[],
    sortingProperties?: SortProperty[],
    pageIndex?: number,
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
  /** Grow (or rebuild) the buffer to at least `target` rows. Incremental
   *  grows APPEND the missing ~500-row pages; `bulk` (Show all) and fresh
   *  loads REPLACE with one request. */
  ensureVisible: (target: number, opts?: { forceFetch?: boolean; bulk?: boolean }) => Promise<void>;
  /** Append ONE more APPEND_PAGE_SIZE page beyond the loaded prefix.
   *  Serves the visible-space top-up loop in TransactionsTab (Show Only
   *  filters make raw rows ≠ visible rows, so a +N may need extra pages
   *  until enough rows survive the client filter). Does not change
   *  `targetVisible`. Resolves null when the buffer isn't an appendable
   *  page-0 prefix, the call was superseded, or the fetch failed;
   *  `exhausted` = the server returned a short page (scope end). */
  appendNextChunk: () => Promise<{ added: number; exhausted: boolean } | null>;
  /** Classic (normal) pagination: fetch EXACTLY the requested 0-based page
   *  at PAGE_SIZE (50) as `{PageIndex, PageSize:50}` and REPLACE the buffer
   *  with that page's rows — true server-side paging, NOT a grow-to-fit
   *  prefix. `hiddenIdsOverride` lets the hide/unhide handlers pass the new
   *  set before the prop propagates (same pattern as notifyHiddenSetChanged). */
  goToPage: (pageIndex: number, opts?: { hiddenIdsOverride?: ReadonlySet<string> }) => Promise<void>;
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
  // one: every grow/replace entry aborts the pending append before planning
  // its own fetch. Without this, a +N append resolving AFTER a superseding
  // filter-change REPLACE could splice stale rows onto the new buffer
  // (appendBatch's guardFirstRowId is the second line of defense).
  const appendAbortRef = useRef<AbortController | null>(null);

  // APPEND page cursor: which APPEND_PAGE_SIZE pages of the current scope
  // are loaded. Re-seeded from the row count on every page-0 REPLACE and
  // set to null when the buffer is NOT an appendable page-0 prefix (classic
  // goToPage buffers, checkout switches). Explicit page indices — NEVER
  // derived from `transactions.length` at fetch time, which breaks after a
  // Show all / hide-refill / short final page.
  const loadedPagesRef = useRef<Set<number> | null>(null);

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

  /** Fetch + append the given APPEND_PAGE_SIZE pages. Owns the append
   *  abort controller, marks the pages loaded on success, and routes the
   *  response count: plain appends refresh the scope total inside
   *  appendBatch (`updateTotal`), NI appends return the VISIBLE total for
   *  the caller to store in `visibleTotalState`. Returns appendBatch's
   *  result, or null when superseded. */
  const runAppend = useCallback(async (
    pages: number[],
    extraFilters: FilterProperty[] | undefined,
    updateTotal: boolean,
  ): Promise<{ rows: TransactionRow[]; totalCount: number | null } | null> => {
    const a = argsRef.current;
    const guardFirstRowId = a.transactions.length > 0
      ? String((a.transactions[0] as Record<string, unknown>)['Id'] ?? '')
      : null;
    const controller = new AbortController();
    appendAbortRef.current = controller;
    const res = await a.appendBatch(a.outgoingFilters, pages, {
      pageSize: APPEND_PAGE_SIZE,
      extraFilters,
      sortingProperties: a.effectiveSorting,
      signal: controller.signal,
      updateTotal,
      guardFirstRowId,
    });
    if (appendAbortRef.current === controller) appendAbortRef.current = null;
    if (controller.signal.aborted) return null;
    if (res != null && loadedPagesRef.current != null) {
      for (const p of pages) loadedPagesRef.current.add(p);
    }
    return res;
  }, []);

  const ensureVisibleWithIds = useCallback(async (
    target: number,
    opts: { forceFetch?: boolean; bulk?: boolean; hiddenIdsOverride?: ReadonlySet<string> } = {},
  ): Promise<void> => {
    let clamped = Math.max(PAGE_SIZE, Math.floor(target) || 0);
    // Never SHRINK the window on an incremental grow: with a client-side
    // row filter active (Show Only …) the visible-space `shown` a +N caller
    // computes can collapse far below the current target, and honoring it
    // would contract the rendered window mid-grow. Only a forceFetch
    // (filter change / Refresh / unhide — deliberate resets) shrinks.
    if (!opts.forceFetch) clamped = Math.max(clamped, targetVisibleRef.current);
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
    // this call may be about to (re)build.
    appendAbortRef.current?.abort();
    appendAbortRef.current = null;
    // `hiddenIdsOverride` carries the post-hide/unhide set: the notify
    // call runs in the same tick as setHiddenDefIds, before the new prop
    // lands.
    const ids = opts.hiddenIdsOverride ?? argsRef.current.hiddenDefIds;
    const key = `${filtersEpochRef.current}:${[...ids].sort().join('|')}`;
    // A load is FRESH (replace page 0) vs an INCREMENTAL grow. Fresh: an
    // explicit forceFetch (filter change / Refresh / tag-save / unhide), a
    // scope/hidden-set change (key mismatch, e.g. a hide), an empty buffer,
    // or a buffer that isn't an appendable page-0 prefix (classic page
    // nav). `opts.bulk` (Show all) also takes the replace path: one
    // `{PageIndex:0, PageSize:N}` request is far cheaper than N/500
    // appended pages (each request pays a fixed full-count cost, and the
    // parallel batch would hammer the database with concurrent counts).
    // Only a non-bulk incremental grow (+N button) APPENDS.
    const a0 = argsRef.current;
    const isFresh = !!opts.forceFetch
      || bufferKeyRef.current !== key
      || a0.transactions.length === 0
      || loadedPagesRef.current == null;
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

      // INCREMENTAL grow of an existing NI-excluded buffer: append only the
      // missing page(s) of the excluded set, carrying the SAME two NI
      // properties as extra filters. Verified against QA: the backend pages
      // the NI-excluded set correctly beyond page 0 (no duplicates, no
      // order differences, stable visible total).
      if (useAppend) {
        const pages = pagesToGrow(loadedPagesRef.current!, clamped);
        if (pages.length === 0) {
          setRefilling(false);
          return;
        }
        setRefilling(true);
        const res = await runAppend(pages, [...(extras ?? []), ...buildNiFilters(ids)], false);
        if (token !== runRef.current) return;
        if (res != null && res.totalCount != null) {
          // The NI query's count is the exact VISIBLE total.
          const next = { key, value: res.totalCount };
          visibleTotalRef.current = next;
          setVisibleTotalState(next);
        }
        setRefilling(false);
        return;
      }

      // FRESH (or bulk): re-fetch page 0 at PageSize `clamped`, REPLACE the
      // buffer, and capture the exact visible total.
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
      loadedPagesRef.current = seedLoadedPages(res.rows.length);
      if (res.visibleTotal != null) {
        const next = { key, value: res.visibleTotal };
        visibleTotalRef.current = next;
        setVisibleTotalState(next);
      }
      setRefilling(false);
      return;
    }

    // ---- PLAIN PATH (no hidden tags) ----
    // No hidden rows to exclude, so `clamped` raw rows are `clamped`
    // visible rows.
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

    // INCREMENTAL grow: append only the missing page(s) — a +N click
    // fetches `{PageIndex:next, PageSize:500}` and the new rows are
    // appended, instead of re-downloading the whole window from row 0
    // with a bigger PageSize.
    if (useAppend) {
      const pages = pagesToGrow(loadedPagesRef.current!, clamped);
      if (pages.length === 0) {
        setRefilling(false);
        return;
      }
      setRefilling(true);
      await runAppend(pages, extras, true);
      if (token === runRef.current) setRefilling(false);
      return;
    }

    // FRESH (or bulk): page 0 at PageSize `clamped`, REPLACE the buffer.
    setRefilling(true);
    const rows = await a.replaceFromBeginning(a.outgoingFilters, clamped, extras, a.effectiveSorting);
    if (token === runRef.current) {
      bufferKeyRef.current = key;
      loadedPagesRef.current = seedLoadedPages(rows.length);
      setRefilling(false);
    }
  }, [runAppend]);

  const ensureVisible = useCallback(
    (target: number, opts?: { forceFetch?: boolean; bulk?: boolean }) =>
      ensureVisibleWithIds(target, { forceFetch: opts?.forceFetch, bulk: opts?.bulk }),
    [ensureVisibleWithIds],
  );

  // One extra APPEND_PAGE_SIZE page for the visible-space top-up loop in
  // TransactionsTab (client row filters). Same single-flight + page-cursor
  // discipline as the +N append, without touching targetVisible.
  const appendNextChunk = useCallback(async (): Promise<{ added: number; exhausted: boolean } | null> => {
    const a = argsRef.current;
    if (!a.isLiveMode) return null;
    if (loadedPagesRef.current == null || a.transactions.length === 0) return null;
    const ids = a.hiddenDefIds;
    const key = `${filtersEpochRef.current}:${[...ids].sort().join('|')}`;
    // The buffer must belong to the current scope + hidden set — a stale
    // buffer means a replace is imminent (or the caller's loop is stale).
    if (bufferKeyRef.current !== key) return null;
    const token = ++runRef.current;
    appendAbortRef.current?.abort();
    appendAbortRef.current = null;
    const page = nextUnloadedPage(loadedPagesRef.current);
    const extras = a.activeExtraFilters.length > 0 ? a.activeExtraFilters : undefined;
    const extraFilters = ids.size > 0 ? [...(extras ?? []), ...buildNiFilters(ids)] : extras;
    setRefilling(true);
    const res = await runAppend([page], extraFilters, ids.size === 0);
    if (token === runRef.current) setRefilling(false);
    if (res == null || token !== runRef.current) return null;
    if (ids.size > 0 && res.totalCount != null) {
      const next = { key, value: res.totalCount };
      visibleTotalRef.current = next;
      setVisibleTotalState(next);
    }
    return { added: res.rows.length, exhausted: res.rows.length < APPEND_PAGE_SIZE };
  }, [runAppend]);

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

  // Classic (normal) pagination: fetch EXACTLY page `pageIndex` at
  // PAGE_SIZE (50) and REPLACE the buffer with that one page. Unlike
  // ensureVisible (which loads a growing prefix), this sends a single
  // `{PageIndex, PageSize:50}` request — true server-side paging, so
  // navigating to page 12 loads that page's 50 rows, not `12*50` rows.
  // The buffer holds only the current page; the classic slice in
  // TransactionsTab shows it whole (no `currentPage*50` offset in live
  // mode). `TransactionsCount` is page-independent, so the plain total /
  // dual-query visible total stay correct at any page index.
  const goToPage = useCallback(async (
    pageIndex: number,
    opts: { hiddenIdsOverride?: ReadonlySet<string> } = {},
  ): Promise<void> => {
    const a = argsRef.current;
    // Sample / non-live mode paginates purely by client slice over the
    // fully-loaded buffer — no fetch, the slice reads currentPage directly.
    if (!a.isLiveMode) return;
    const token = ++runRef.current;
    // A pending +N append belongs to the incremental prefix buffer this
    // page fetch is about to replace — cancel it.
    appendAbortRef.current?.abort();
    appendAbortRef.current = null;
    // A classic page buffer is NOT a page-0 prefix, so it can never anchor
    // an append; a later incremental grow must start with a fresh replace.
    loadedPagesRef.current = null;
    // Classic shows one page, so the intent window is a single PAGE_SIZE.
    targetVisibleRef.current = PAGE_SIZE;
    setTargetVisible(PAGE_SIZE);
    const ids = opts.hiddenIdsOverride ?? a.hiddenDefIds;
    const key = `${filtersEpochRef.current}:${[...ids].sort().join('|')}`;
    const extras = a.activeExtraFilters.length > 0 ? a.activeExtraFilters : undefined;
    setRefilling(true);
    if (ids.size > 0) {
      const res = await a.replaceFromBeginningExcluding(
        a.outgoingFilters,
        PAGE_SIZE,
        [...ids],
        extras,
        a.effectiveSorting,
        pageIndex,
      );
      if (token !== runRef.current) return;
      if (res == null) {
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
    await a.replaceFromBeginning(a.outgoingFilters, PAGE_SIZE, extras, a.effectiveSorting, pageIndex);
    if (token === runRef.current) {
      bufferKeyRef.current = key;
      setRefilling(false);
    }
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
    appendAbortRef.current?.abort();
    appendAbortRef.current = null;
    loadedPagesRef.current = null;
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
    appendNextChunk,
    goToPage,
    refetch,
    resetTargetVisible,
    notifyHiddenSetChanged,
  };
}
