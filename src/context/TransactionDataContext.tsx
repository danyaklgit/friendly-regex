import { createContext, useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from 'react';
import type { TransactionRow } from '../types';
import { deriveFieldMeta, type FieldMeta } from '../utils/deriveFieldMeta';
import { translateFilters } from '../utils/translateFilters';
import { getTransactions, getFilters, getUserFilters, markTransactionsAsDeadEnd, unmarkDeadEndTransactions, setTransactionsComment, DEFAULT_SORTING, type TepHeaders, type FilterDefinition, type FilterProperty, type SetTransactionsCommentEntry, type SortProperty } from '../api/transactions';
import { useAuth } from './AuthContext';
import { useTepConfig } from './TepConfigContext';
import { loadSampleTransactions } from '../data/loadSampleData';
import { DEFAULT_DATA_SET_TYPE } from '../constants/dataSetTypes';

// Default page size for the initial Transactions load + every
// filter-change refetch. Stays at 50 so the first paint is light —
// operators landing on the tab see 50 rows immediately rather than
// waiting for 200 to transfer + render.
//
// Incremental +N clicks APPEND the missing pages via `appendBatch`
// (~500-row chunks — see useVisibleRowsEngine), so they only transfer
// rows the buffer doesn't already hold. `Show all` stays a single
// `{PageIndex:0, PageSize:remaining}` replace (`replaceFromBeginning`,
// backend PageSize is uncapped) — one request beats hundreds of paged
// appends because every request pays a fixed full-count cost.
//
// Both pagination modes render windows over the same loaded prefix
// buffer (see useVisibleRowsEngine): classic mode fetches exact
// `{PageIndex:k, PageSize:50}` pages, so this constant is also the
// classic page length.
export const PAGE_SIZE = 50;

export interface AppendBatchOptions {
  /** Server page size for the appended pages (default PAGE_SIZE). The
   *  incremental engine appends at ~500 to amortize the fixed per-request
   *  cost. `pageIndices` are in THIS size's space. */
  pageSize?: number;
  extraFilters?: FilterProperty[];
  sortingProperties?: SortProperty[];
  /** Caller-owned single-flight: a superseding replace aborts the batch
   *  BEFORE its commit so stale rows are never spliced onto a new buffer. */
  signal?: AbortSignal;
  /** Refresh `totalTransactionsCount` from the appended pages' response
   *  count so the scope total doesn't go stale during an appended stream.
   *  Plain scope queries only — an NI-filtered (hidden tags) append returns
   *  the VISIBLE total, which must not overwrite the scope total (the
   *  hidden tally is scope − visible). */
  updateTotal?: boolean;
  /** Commit guard: append only while the buffer still starts with this row
   *  id (null = the buffer was empty when the append was planned). Second
   *  line of defense after `signal` — if the buffer was replaced between
   *  plan and commit, the append is dropped instead of splicing stale rows
   *  onto the rebuilt buffer. */
  guardFirstRowId?: string | null;
}

export interface TransactionDataContextValue {
  transactions: TransactionRow[];
  fieldMeta: FieldMeta;
  loadTransactions: (rows: TransactionRow[]) => void;
  resetToSample: () => void;
  isCustomData: boolean;
  flagDeadEnd: (ids: string[], value: boolean) => Promise<void>;
  setComments: (entries: SetTransactionsCommentEntry[]) => Promise<void>;
  flagDeadEndWithComment: (ids: string[], value: boolean, entries?: SetTransactionsCommentEntry[]) => Promise<void>;
  // Live mode additions
  isLiveMode: boolean;
  loading: boolean;
  hasMore: boolean;
  totalTransactionsCount: number | null;
  /** Fetches a page of transactions. Resolves with the rows that were just
   *  loaded (the new chunk in append mode, or the full page in replace mode).
   *  Resolves with an empty array on abort, error, or non-live mode. */
  fetchPage: (filters: Record<string, Set<string>>, append: boolean, pageIndex?: number, pageSize?: number, extraFilters?: FilterProperty[], sortingProperties?: SortProperty[]) => Promise<TransactionRow[]>;
  /** Append several pages in parallel — see implementation comment for
   *  why this lives separate from `fetchPage`. Returns the fetched rows
   *  (pre-dedupe, in `pageIndices` order) plus the response's
   *  `TransactionsCount`, or null on abort / error / non-live mode. The
   *  buffer commit dedupes by row id and honors `guardFirstRowId`. */
  appendBatch: (filters: Record<string, Set<string>>, pageIndices: number[], opts?: AppendBatchOptions) => Promise<{ rows: TransactionRow[]; totalCount: number | null } | null>;
  /** Fetch the first N rows in ONE request and replace the buffer
   *  atomically (no pre-fetch clear / flicker). Used by fresh loads and
   *  `Show all` (backend `PageSize` is uncapped, so one round trip beats
   *  hundreds of paged appends — each request pays a fixed full-count
   *  cost). Incremental `+N` grows go through `appendBatch` instead. */
  replaceFromBeginning: (filters: Record<string, Set<string>>, pageSize: number, extraFilters?: FilterProperty[], sortingProperties?: SortProperty[], pageIndex?: number) => Promise<TransactionRow[]>;
  /** Hidden-tag aware variant: ONE query with two `NI` exclusions on the
   *  hidden definition ids (primary + multi-tag columns) — the backend keeps
   *  untagged rows under `NI`, so this alone is the visible set — plus a
   *  PageSize-1 no-exclusion count for the scope total (written to
   *  `totalTransactionsCount`). Returns the first `pageSize` visible rows and
   *  the EXACT visible total (the NI query's count), or null on abort/error. */
  replaceFromBeginningExcluding: (filters: Record<string, Set<string>>, pageSize: number, hiddenDefIds: string[], extraFilters?: FilterProperty[], sortingProperties?: SortProperty[], pageIndex?: number) => Promise<{ rows: TransactionRow[]; visibleTotal: number | null } | null>;
  fetchCount: (filters: Record<string, Set<string>>, extraFilters?: FilterProperty[], sortingProperties?: SortProperty[], signal?: AbortSignal) => Promise<number | null>;
  trimLoadedTransactions: (count: number) => void;
  filterDefinitions: FilterDefinition[];
  filterDefinitionsLoading: boolean;
  fetchFilterDefinitions: (dataSetType?: string) => Promise<void>;
  /** User-screen filter definitions, fetched from GetUserFilters. Kept
   *  separate from the operator `filterDefinitions` so the user table's
   *  TransactionType label lookup (which reads `filterDefinitions`) is
   *  unaffected by the user-mode filter bar. */
  userFilterDefinitions: FilterDefinition[];
  userFilterDefinitionsLoading: boolean;
  /** Fetch user-screen filters. Pass selected bank SWIFT codes to narrow the
   *  BANKS filter and receive the ATTR:* attribute filters (union of their
   *  values). Omit on the first call (bank picker) to list all banks. */
  fetchUserFilterDefinitions: (banks?: string[], dataSetType?: string) => Promise<void>;
  decimalMaxValues: Map<string, number>;
  fetchDecimalMaxValues: (filterDefs: FilterDefinition[]) => Promise<void>;
  /** Set the "whole documents" anchor column applied to every grid fetch (or
   *  null to disable). When set (Ledger uses `'TransactionId'`), reads route to
   *  `GetTEPTransactionsAnchorBased` so a matched leg pulls in its whole
   *  journal entry. Read from a ref at request time, so callers set it once and
   *  the next fetch picks it up. */
  setAnchorColumn: (col: string | null) => void;
}

export const TransactionDataContext = createContext<TransactionDataContextValue | null>(null);

export function TransactionDataProvider({ children }: { children: ReactNode }) {
  const { useDummyData, userId, getAuthHeaders, refreshIfNeeded } = useAuth();
  const tepConfig = useTepConfig();
  const isLiveMode = !useDummyData;

  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isCustomData, setIsCustomData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalTransactionsCount, setTotalTransactionsCount] = useState<number | null>(null);
  const [filterDefinitions, setFilterDefinitions] = useState<FilterDefinition[]>([]);
  const [filterDefinitionsLoading, setFilterDefinitionsLoading] = useState(false);
  const [userFilterDefinitions, setUserFilterDefinitions] = useState<FilterDefinition[]>([]);
  const [userFilterDefinitionsLoading, setUserFilterDefinitionsLoading] = useState(false);
  const [decimalMaxValues, setDecimalMaxValues] = useState<Map<string, number>>(new Map());
  const currentPageRef = useRef(0);
  const loadedCountRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // "Whole documents" anchor applied to every grid fetch (null = off). Read at
  // request time so the caller (TransactionsTab's Ledger toggle) sets it once
  // and the next fetch picks it up without threading it through every fetch
  // signature. See setAnchorColumn / GetTransactionsRequest.Anchor.
  const anchorColumnRef = useRef<string | null>(null);
  const setAnchorColumn = useCallback((col: string | null) => { anchorColumnRef.current = col || null; }, []);
  // Spread into each getTransactions request body — omits the key entirely
  // when off, so non-Ledger reads are byte-identical to before.
  const anchorPayload = (): { Anchor?: string } => (anchorColumnRef.current ? { Anchor: anchorColumnRef.current } : {});
  // Mirror filterDefinitions into a ref so `fetchPage` / `fetchCount` can read
  // them without listing the array in their dependency arrays. Listing them
  // would churn the callback identity every time GetFilters returns, which
  // re-fires every downstream effect that has fetchPage as a dep — and that
  // includes the live-fetch effect in TransactionsTab, causing GetTEPTransactions
  // to fire on every manual filter refresh. Translating with a stale snapshot
  // is harmless: filter keys map to the same backend column names, and the
  // next legitimate fetch (filter change, scope change, save) picks up the
  // refreshed defs from the ref.
  const filterDefinitionsRef = useRef<FilterDefinition[]>([]);
  useEffect(() => { filterDefinitionsRef.current = filterDefinitions; }, [filterDefinitions]);

  const fieldMetaRef = useRef<FieldMeta | null>(null);
  const fieldMeta = useMemo(() => {
    // When transactions are temporarily empty during a refetch, preserve the
    // previous fieldMeta so that dropdowns (e.g. Source Field in the rule
    // builder) don't lose their displayed value.
    if (transactions.length === 0 && fieldMetaRef.current) {
      return fieldMetaRef.current;
    }
    const next = deriveFieldMeta(transactions);
    fieldMetaRef.current = next;
    return next;
  }, [transactions]);

  const loadTransactions = useCallback((rows: TransactionRow[]) => {
    setTransactions(rows);
    setIsCustomData(true);
  }, []);

  const resetToSample = useCallback(() => {
    loadSampleTransactions().then((rows) => {
      setTransactions(rows);
      setIsCustomData(false);
    });
  }, []);

  // Dummy-data mode: the sample transactions live in a dynamically-imported
  // chunk (kept out of the production bundle). Load them once on mount and seed
  // the table. The `prev.length === 0` guard avoids clobbering custom data the
  // operator may have uploaded before the (cached) import resolves.
  useEffect(() => {
    if (!useDummyData) return;
    let cancelled = false;
    loadSampleTransactions().then((rows) => {
      if (!cancelled) setTransactions((prev) => (prev.length === 0 ? rows : prev));
    });
    return () => { cancelled = true; };
  }, [useDummyData]);

  const flagDeadEnd = useCallback(async (ids: string[], value: boolean) => {
    if (isLiveMode) {
      await refreshIfNeeded();
      const authHeaders = getAuthHeaders();
      const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
      const tepHeaders: TepHeaders = {        userId: userId ?? '',
        tenantCode: tepConfig.ttpTenantCode,
        languageCode: tepConfig.languageCode,
        timeZone: tepConfig.timeZone,
        requestId: tepConfig.ttpRequestId,
      };
      if (value) {
        await markTransactionsAsDeadEnd(ids, token, tepHeaders);
      } else {
        await unmarkDeadEndTransactions(ids, token, tepHeaders);
      }
    }
    const idSet = new Set(ids);
    setTransactions((prev) =>
      prev.map((row) =>
        idSet.has(String(row[fieldMeta.identifierField] ?? row['Id'] ?? ''))
          ? { ...row, IsDeadEnd: value }
          : row
      )
    );
  }, [fieldMeta.identifierField, isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  const setComments = useCallback(async (entries: SetTransactionsCommentEntry[]) => {
    if (entries.length === 0) return;
    if (isLiveMode) {
      await refreshIfNeeded();
      const authHeaders = getAuthHeaders();
      const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
      const tepHeaders: TepHeaders = {        userId: userId ?? '',
        tenantCode: tepConfig.ttpTenantCode,
        languageCode: tepConfig.languageCode,
        timeZone: tepConfig.timeZone,
        requestId: tepConfig.ttpRequestId,
      };
      await setTransactionsComment(entries, token, tepHeaders);
    }
    const byId = new Map(entries.map((e) => [e.Id, e.Comment ?? '']));
    setTransactions((prev) =>
      prev.map((row) => {
        const id = String(row[fieldMeta.identifierField] ?? row['Id'] ?? '');
        if (!byId.has(id)) return row;
        return { ...row, Comment: byId.get(id) ?? '' };
      })
    );
  }, [fieldMeta.identifierField, isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  // Flag/unflag + (optionally) set comments. Sequential so that a comment-API
  // failure does not silently roll back the deadend flip — the dialog surfaces
  // the error and local state reflects the partial success.
  const flagDeadEndWithComment = useCallback(async (
    ids: string[],
    value: boolean,
    entries?: SetTransactionsCommentEntry[],
  ) => {
    await flagDeadEnd(ids, value);
    if (entries && entries.length > 0) {
      await setComments(entries);
    }
  }, [flagDeadEnd, setComments]);

  const filterFetchingRef = useRef(false);
  // Scope of the last explicit GetFilters request. No-arg refetches (post-save
  // per gotcha #4, the table's Refresh button, post-hierarchy-sync) reuse it so
  // they don't silently reset a Ledger/intraday catalog back to MT940.
  const lastFilterDataSetTypeRef = useRef<string>(DEFAULT_DATA_SET_TYPE);
  const fetchFilterDefinitions = useCallback(async (dataSetType?: string) => {
    if (!isLiveMode || filterFetchingRef.current) return;
    const scope = dataSetType ?? lastFilterDataSetTypeRef.current;
    lastFilterDataSetTypeRef.current = scope;
    filterFetchingRef.current = true;
    try {
      await refreshIfNeeded();
      const authHeaders = getAuthHeaders();
      const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
      if (!token) return;
      const tepHeaders: TepHeaders = {        userId: userId ?? '',
        tenantCode: tepConfig.ttpTenantCode,
        languageCode: tepConfig.languageCode,
        timeZone: tepConfig.timeZone,
        requestId: tepConfig.ttpRequestId,
      };
      setFilterDefinitionsLoading(true);
      const defs = await getFilters(scope, token, tepHeaders);
      setFilterDefinitions(defs);
    } catch (err) {
      console.error('Failed to fetch filter definitions:', err);
    } finally {
      setFilterDefinitionsLoading(false);
      filterFetchingRef.current = false;
    }
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  const userFilterFetchingRef = useRef(false);
  const fetchUserFilterDefinitions = useCallback(async (banks?: string[], dataSetType: string = DEFAULT_DATA_SET_TYPE) => {
    if (!isLiveMode || userFilterFetchingRef.current) return;
    userFilterFetchingRef.current = true;
    try {
      await refreshIfNeeded();
      const authHeaders = getAuthHeaders();
      const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
      if (!token) return;
      const tepHeaders: TepHeaders = {        userId: userId ?? '',
        tenantCode: tepConfig.ttpTenantCode,
        languageCode: tepConfig.languageCode,
        timeZone: tepConfig.timeZone,
        requestId: tepConfig.ttpRequestId,
      };
      setUserFilterDefinitionsLoading(true);
      const defs = await getUserFilters(dataSetType, token, tepHeaders, undefined, banks);
      setUserFilterDefinitions(defs);
    } catch (err) {
      console.error('Failed to fetch user filter definitions:', err);
    } finally {
      setUserFilterDefinitionsLoading(false);
      userFilterFetchingRef.current = false;
    }
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  const fetchDecimalMaxValues = useCallback(async (filterDefs: FilterDefinition[]) => {
    if (!isLiveMode) return;
    const decimalDefs = filterDefs.filter((d) => d.Type === 'DECIMAL');
    if (decimalDefs.length === 0) return;
    await refreshIfNeeded();
    const authHeaders = getAuthHeaders();
    const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
    if (!token) return;
    const tepHeaders: TepHeaders = {      userId: userId ?? '',
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
    const results = new Map<string, number>();
    await Promise.all(decimalDefs.map(async (def) => {
      // Probe each column candidate as a sort key in parallel — the API may only
      // honour certain column names for ORDER BY, so we try all candidates and
      // keep the highest value found across all probes.
      const sortCandidates = [...new Set(
        [def.Tag, ...def.Values.map((v) => v.Column).filter(Boolean)] as string[]
      )];
      const probeValues = await Promise.all(sortCandidates.map(async (sortCol) => {
        try {
          const d = await getTransactions(
            {
              FilteringProperties: [],
              SortingProperties: [{ ColumnName: sortCol, SortingLevel: 1, SortingOrder: 'DESC' }],
              Pagination: { PageIndex: 0, PageSize: 1 },
            },
            token,
            tepHeaders,
          );
          const row = d.Transactions?.[0];
          if (!row) return 0;
          // Read the value for this exact sort column first
          const direct = row[sortCol];
          if (direct != null) {
            const n = Number(direct);
            if (!isNaN(n) && n > 0) return n;
          }
          // Substring fallback for column name mismatches
          const colLower = sortCol.toLowerCase();
          for (const [field, v] of Object.entries(row)) {
            const fl = field.toLowerCase();
            if (fl === colLower || fl.includes(colLower) || colLower.includes(fl)) {
              const n = Number(v);
              if (!isNaN(n) && n > 0) return n;
            }
          }
        } catch { /* silently skip */ }
        return 0;
      }));
      const maxFound = Math.max(0, ...probeValues);
      if (maxFound > 0) results.set(def.Tag, maxFound);
    }));
    if (results.size > 0) setDecimalMaxValues(results);
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  const fetchPage = useCallback(async (filters: Record<string, Set<string>>, append: boolean, explicitPage?: number, pageSize?: number, extraFilters?: FilterProperty[], sortingProperties?: SortProperty[]): Promise<TransactionRow[]> => {
    if (!isLiveMode) return [];

    // Auto-refresh session if <5 min remaining
    await refreshIfNeeded();

    const authHeaders = getAuthHeaders();
    const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
    if (!token) return [];

    const tepHeaders: TepHeaders = {      userId: userId ?? '',
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };

    const effectivePageSize = pageSize ?? PAGE_SIZE;
    // When appending with a custom page size, calculate page index from current row count
    // so we don't skip or re-fetch rows due to page size mismatch
    const pageIndex = explicitPage != null
      ? explicitPage
      : append
        ? Math.floor(loadedCountRef.current / effectivePageSize)
        : 0;

    // Abort any in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) {
      setTransactions([]);
    }
    setLoading(true);
    try {
      const data = await getTransactions(
        {
          FilteringProperties: [...translateFilters(filters, filterDefinitionsRef.current), ...(extraFilters ?? [])],
          SortingProperties: sortingProperties ?? DEFAULT_SORTING,
          Pagination: { PageIndex: pageIndex, PageSize: effectivePageSize },
          ...anchorPayload(),
        },
        token,
        tepHeaders,
        controller.signal,
      );

      const rawRows = data.Transactions ?? [];
      // Backend returns the dead-end flag under `OpsIsDeadEnd` (with a string
      // "True" / "False" value), but every row-level read in the app keys off
      // `IsDeadEnd` as a boolean. Mirror the field on ingest so the badge,
      // selection-bar state, and sample-mode filter keep working after a
      // refetch — without forcing every read site to handle both names.
      const rows = rawRows.map((row) => {
        if (row['IsDeadEnd'] != null) return row;
        const ops = row['OpsIsDeadEnd'];
        if (ops == null) return row;
        const isDead = typeof ops === 'string' ? ops.toLowerCase() === 'true' : ops === true;
        return { ...row, IsDeadEnd: isDead };
      });
      currentPageRef.current = pageIndex;
      setHasMore(rows.length >= effectivePageSize);

      // Refresh the scope total on APPENDED pages too — an appended stream
      // that never updates the count leaves the total stale for its whole
      // duration (intraday ingestion moves it).
      if (data.TransactionsCount != null) {
        setTotalTransactionsCount(data.TransactionsCount);
      }

      if (append) {
        setTransactions((prev) => {
          const next = [...prev, ...rows];
          loadedCountRef.current = next.length;
          return next;
        });
      } else {
        setTransactions(rows);
        loadedCountRef.current = rows.length;
      }
      return rows;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return [];
      console.error('Failed to fetch transactions:', err);
      return [];
    } finally {
      // Only clear loading if this controller is still the active one
      // (i.e. it wasn't replaced by a newer fetch)
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  /**
   * Append several pages in PARALLEL and commit them as a single state
   * update. This is the incremental `+N` primitive (via
   * useVisibleRowsEngine): each click fetches ONLY the pages the buffer
   * doesn't already hold, at an explicit page size (~500), instead of
   * re-downloading the whole window from row 0.
   *
   * Why a separate method from `fetchPage`:
   *
   *  - `fetchPage` calls `abortRef.current?.abort()` to enforce
   *    single-flight semantics (filter-change races). Firing several of
   *    them in parallel would cancel each other. `appendBatch` instead
   *    takes a caller-owned `signal`; the visible-rows engine aborts a
   *    pending append before every superseding fetch.
   *  - `fetchPage`'s pageIndex math reads `loadedCountRef.current`, which
   *    is only correct while every prior fetch used the same page size.
   *    Callers of `appendBatch` pass EXPLICIT page indices from their own
   *    page cursor, so a preceding Show all / hide-refill / short final
   *    page can't misalign the fetch.
   *
   * Results merge in the requested `pageIndices` order. The commit dedupes
   * by row id — the backend pages with skip/limit under a sort key that is
   * not a total order, and intraday ingestion shifts offsets, so an
   * appended page can carry a row the buffer already holds (or the planned
   * first page can deliberately overlap a non-page-aligned buffer) — and
   * honors `guardFirstRowId` so a superseded append never splices stale
   * rows onto a rebuilt buffer.
   *
   * Deliberately does NOT touch the global `loading` flag: appended grows
   * are represented by the engine's `refilling` state. `loading` disables
   * every row checkbox and skeletons the pagination strip — correct for a
   * buffer replace, hostile for a grow that keeps the current rows valid.
   */
  const appendBatch = useCallback(async (
    filters: Record<string, Set<string>>,
    pageIndices: number[],
    opts?: AppendBatchOptions,
  ): Promise<{ rows: TransactionRow[]; totalCount: number | null } | null> => {
    if (!isLiveMode) return null;
    if (pageIndices.length === 0) return { rows: [], totalCount: null };

    await refreshIfNeeded();
    const authHeaders = getAuthHeaders();
    const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
    if (!token) return null;
    const tepHeaders: TepHeaders = {      userId: userId ?? '',
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
    const filteringProperties = [...translateFilters(filters, filterDefinitionsRef.current), ...(opts?.extraFilters ?? [])];
    const pageSize = opts?.pageSize ?? PAGE_SIZE;

    try {
      // Fire all page requests in parallel. The browser caps concurrent
      // requests per origin (~6 for HTTP/1, much higher for HTTP/2); the
      // engine keeps batches small (bulk loads go through
      // replaceFromBeginning as ONE request precisely so a huge window
      // never becomes hundreds of parallel counts on the database).
      const results = await Promise.all(
        pageIndices.map((pageIndex) =>
          getTransactions(
            {
              FilteringProperties: filteringProperties,
              SortingProperties: opts?.sortingProperties ?? DEFAULT_SORTING,
              Pagination: { PageIndex: pageIndex, PageSize: pageSize },
              ...anchorPayload(),
            },
            token,
            tepHeaders,
            opts?.signal,
          ).then((data) => ({ pageIndex, data })),
        ),
      );

      // Merge in the requested index order — `Promise.all` preserves
      // input order regardless of completion order, but defensive sort
      // here makes the contract explicit and lets us tolerate any future
      // caller reordering its index list.
      results.sort((a, b) => a.pageIndex - b.pageIndex);

      const merged: TransactionRow[] = [];
      let lastPageRows = 0;
      let totalCount: number | null = null;
      for (const { data } of results) {
        const raw = data.Transactions ?? [];
        // Same OpsIsDeadEnd / IsDeadEnd mirror that fetchPage applies on
        // ingest. Without it the downstream readers (badge, selection
        // bar, sample-mode filter) miss the flag for newly-appended rows.
        const rows = raw.map((row) => {
          if (row['IsDeadEnd'] != null) return row;
          const ops = row['OpsIsDeadEnd'];
          if (ops == null) return row;
          const isDead = typeof ops === 'string' ? ops.toLowerCase() === 'true' : ops === true;
          return { ...row, IsDeadEnd: isDead };
        });
        merged.push(...rows);
        lastPageRows = rows.length;
        if (data.TransactionsCount != null) totalCount = data.TransactionsCount;
      }

      // hasMore mirrors fetchPage's contract: full last page means more
      // is likely available; short last page (or empty) means we've
      // exhausted the dataset.
      setHasMore(lastPageRows >= pageSize);
      // Keep the scope total fresh during the appended stream — but only
      // for plain scope queries (see AppendBatchOptions.updateTotal).
      if (opts?.updateTotal && totalCount != null) {
        setTotalTransactionsCount(totalCount);
      }
      setTransactions((prev) => {
        // Commit guard: the append was planned against a buffer starting
        // with `guardFirstRowId`. If the buffer was replaced meanwhile
        // (the engine's abort should have prevented this — belt and
        // braces), drop the append rather than splice stale rows.
        if (opts?.guardFirstRowId !== undefined) {
          const prevFirst = prev.length > 0 ? String(prev[0]['Id'] ?? '') : null;
          if (prevFirst !== opts.guardFirstRowId) return prev;
        }
        // Dedupe by row id (wire field is `Id` — do not "clean up" the
        // fallback). Rows without an id are kept: an empty key would
        // collapse distinct rows.
        const seen = new Set<string>();
        for (const r of prev) {
          const id = String(r['Id'] ?? '');
          if (id) seen.add(id);
        }
        const fresh: TransactionRow[] = [];
        for (const r of merged) {
          const id = String(r['Id'] ?? '');
          if (id) {
            if (seen.has(id)) continue;
            seen.add(id);
          }
          fresh.push(r);
        }
        const next = [...prev, ...fresh];
        loadedCountRef.current = next.length;
        return next;
      });
      return { rows: merged, totalCount };
    } catch (err) {
      // A superseding fetch (filter change / new +N / hide) aborts this
      // batch via `signal` BEFORE `Promise.all` resolves, so no partial
      // rows were committed — swallow the abort quietly. The buffer commit
      // above only runs on the success path.
      if ((err as Error).name === 'AbortError') return null;
      console.error('Failed to batch-fetch transactions:', err);
      return null;
    }
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  /**
   * Fetch a single page from the START of the dataset and REPLACE the
   * buffer wholesale — used by `+N` pagination and `Show all` now that
   * the backend confirms PageSize is uncapped. With one request that
   * pulls `loadedCount + N` rows (or `totalCount` for Show all), the
   * pagination flow collapses to a single round trip per click — no
   * parallel batching, no offset-alignment gymnastics, no overfetch
   * loop. The buffer is replaced atomically when the response lands so
   * the operator's view doesn't blank out mid-fetch (unlike `fetchPage`
   * in replace mode, which clears the buffer immediately to signal
   * loading — that flicker is fine on filter changes but disruptive
   * here where the new rows are a superset of the existing ones).
   *
   * Incremental `+N` grows use `appendBatch` (fetch only the missing
   * pages); this replace stays the right tool for fresh loads and bulk
   * windows.
   */
  const replaceFromBeginning = useCallback(async (
    filters: Record<string, Set<string>>,
    pageSize: number,
    extraFilters?: FilterProperty[],
    sortingProperties?: SortProperty[],
    pageIndex = 0,
  ): Promise<TransactionRow[]> => {
    if (!isLiveMode) return [];
    if (pageSize <= 0) return [];

    await refreshIfNeeded();
    const authHeaders = getAuthHeaders();
    const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
    if (!token) return [];
    const tepHeaders: TepHeaders = {      userId: userId ?? '',
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
    const filteringProperties = [...translateFilters(filters, filterDefinitionsRef.current), ...(extraFilters ?? [])];

    setLoading(true);
    // Single-flight: if a fetch is already running it gets aborted.
    // Same contract as `fetchPage` so a stale filter-change refetch
    // can't trample the result of a fresh +N click.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await getTransactions(
        {
          FilteringProperties: filteringProperties,
          SortingProperties: sortingProperties ?? DEFAULT_SORTING,
          Pagination: { PageIndex: pageIndex, PageSize: pageSize },
          ...anchorPayload(),
        },
        token,
        tepHeaders,
        controller.signal,
      );
      const rawRows = data.Transactions ?? [];
      // Same OpsIsDeadEnd / IsDeadEnd mirror that fetchPage and
      // appendBatch apply on ingest, kept consistent across all three
      // ingest paths so downstream readers don't have to special-case.
      const rows = rawRows.map((row) => {
        if (row['IsDeadEnd'] != null) return row;
        const ops = row['OpsIsDeadEnd'];
        if (ops == null) return row;
        const isDead = typeof ops === 'string' ? ops.toLowerCase() === 'true' : ops === true;
        return { ...row, IsDeadEnd: isDead };
      });
      currentPageRef.current = pageIndex;
      setHasMore(rows.length >= pageSize);
      if (data.TransactionsCount != null) {
        setTotalTransactionsCount(data.TransactionsCount);
      }
      // Atomic replace — the old buffer stays visible until this commit,
      // so the operator never sees an empty table during the fetch.
      setTransactions(rows);
      loadedCountRef.current = rows.length;
      return rows;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return [];
      console.error('Failed to fetch transactions:', err);
      return [];
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  /**
   * Hidden-tag aware replace. Excludes hidden tag specs SERVER-SIDE with TWO
   * `NI` filter properties:
   *     { ColumnName: 'OpsTagSpecDefinitionId',           Operand: 'NI', Value: ids }
   *     { ColumnName: 'OpsMultiTags.TagSpecDefinitionId', Operand: 'NI', Value: ids }
   * (pipe-joined ids). Two SEPARATE columns, not the single COMPOSITE
   * `OpsTagSpecDefinitionId|OpsMultiTags.TagSpecDefinitionId` — the composite
   * ignored the multi-tag array and leaked multi-tag-hidden rows (230/250),
   * do NOT revert to it. The backend KEEPS untagged (NULL-tag) rows under
   * `NI`, so this single query returns exactly the visible set and its
   * `TransactionsCount` IS the exact visible total.
   *
   * (An earlier design added a second `OpsIsUntagged = True` query on the
   * belief that `NI` dropped NULL rows — the "bd1267f trap". It does NOT on
   * this backend: verified live, the NI query alone returned total-minus-
   * hidden INCLUDING untagged rows, so the extra half double-counted untagged
   * rows in both the total (5836 + 166 = 6002 vs a true 5836) and the merged
   * buffer. That half + `mergeSortedRows` were removed.)
   *
   * A SECOND parallel count (active filters only, PageSize 1, NO exclusion)
   * gives the no-exclusion scope total — the same number a plain "main" load
   * produces — and is written into `totalTransactionsCount` so the hidden
   * tally is simply `totalTransactionsCount - visibleTotal` and stays correct
   * even when filters change while tags are hidden (the plain load doesn't run
   * then). Same atomic-replace + single-flight contract as
   * replaceFromBeginning.
   */
  const replaceFromBeginningExcluding = useCallback(async (
    filters: Record<string, Set<string>>,
    pageSize: number,
    hiddenDefIds: string[],
    extraFilters?: FilterProperty[],
    sortingProperties?: SortProperty[],
    pageIndex = 0,
  ): Promise<{ rows: TransactionRow[]; visibleTotal: number | null } | null> => {
    if (!isLiveMode) return null;
    if (pageSize <= 0 || hiddenDefIds.length === 0) return null;

    await refreshIfNeeded();
    const authHeaders = getAuthHeaders();
    const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
    if (!token) return null;
    const tepHeaders: TepHeaders = {      userId: userId ?? '',
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
    const hiddenValue = hiddenDefIds.join('|');
    const baseFiltering = [...translateFilters(filters, filterDefinitionsRef.current), ...(extraFilters ?? [])];
    const sorting = sortingProperties ?? DEFAULT_SORTING;

    setLoading(true);
    // Single-flight with every other data fetch: both halves share one
    // controller, so a newer fetch aborts the whole pair.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const [visible, scope] = await Promise.all([
        getTransactions(
          {
            FilteringProperties: [
              ...baseFiltering,
              { ColumnName: 'OpsTagSpecDefinitionId', Value: hiddenValue, Operand: 'NI' },
              { ColumnName: 'OpsMultiTags.TagSpecDefinitionId', Value: hiddenValue, Operand: 'NI' },
            ],
            SortingProperties: sorting,
            Pagination: { PageIndex: pageIndex, PageSize: pageSize },
            ...anchorPayload(),
          },
          token,
          tepHeaders,
          controller.signal,
        ),
        // No-exclusion scope total (the "main load" total for this filter
        // scope). PageSize 1 — we only need its TransactionsCount. Same anchor
        // as the visible query so both counts widen together and "N hidden"
        // (scope − visible) stays consistent.
        getTransactions(
          {
            FilteringProperties: baseFiltering,
            SortingProperties: sorting,
            Pagination: { PageIndex: 0, PageSize: 1 },
            ...anchorPayload(),
          },
          token,
          tepHeaders,
          controller.signal,
        ),
      ]);

      // Same OpsIsDeadEnd / IsDeadEnd mirror as the other ingest paths.
      const mirror = (raw: TransactionRow[]): TransactionRow[] => raw.map((row) => {
        if (row['IsDeadEnd'] != null) return row;
        const ops = row['OpsIsDeadEnd'];
        if (ops == null) return row;
        const isDead = typeof ops === 'string' ? ops.toLowerCase() === 'true' : ops === true;
        return { ...row, IsDeadEnd: isDead };
      });
      // The NI query already returns the visible set in SortingProperties
      // order (untagged rows kept), so its rows ARE the buffer and its
      // TransactionsCount IS the exact visible total — no merge, no sum.
      const rows = mirror(visible.Transactions ?? []).slice(0, pageSize);
      const visibleTotal = visible.TransactionsCount ?? null;

      currentPageRef.current = pageIndex;
      setHasMore(visibleTotal != null ? rows.length < visibleTotal : rows.length >= pageSize);
      // Keep totalTransactionsCount = the no-exclusion scope total (the
      // "main load" total) so the hidden tally is totalTransactionsCount -
      // visibleTotal and stays correct even when filters change while tags
      // are hidden. The visible total travels back to the caller separately.
      const scopeTotal = scope.TransactionsCount ?? null;
      if (scopeTotal != null) setTotalTransactionsCount(scopeTotal);
      setTransactions(rows);
      loadedCountRef.current = rows.length;
      return { rows, visibleTotal };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
      console.error('Failed to fetch transactions (hidden-excluded):', err);
      return null;
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  const fetchCount = useCallback(async (filters: Record<string, Set<string>>, extraFilters?: FilterProperty[], sortingProperties?: SortProperty[], signal?: AbortSignal): Promise<number | null> => {
    if (!isLiveMode) return null;
    await refreshIfNeeded();
    const authHeaders = getAuthHeaders();
    const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
    if (!token) return null;
    const tepHeaders: TepHeaders = {      userId: userId ?? '',
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
    try {
      const data = await getTransactions(
        {
          FilteringProperties: [...translateFilters(filters, filterDefinitionsRef.current), ...(extraFilters ?? [])],
          SortingProperties: sortingProperties ?? DEFAULT_SORTING,
          Pagination: { PageIndex: 0, PageSize: 1 },
          ...anchorPayload(),
        },
        token,
        tepHeaders,
        signal,
      );
      return data.TransactionsCount ?? null;
    } catch {
      return null;
    }
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  // Abort pending requests on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Drop the last `count` rows from the live-mode buffer (no network round-trip).
  // Mirror of the forward-incremental "+N" load: lets the user shrink the loaded
  // window so the table stays light. Re-enables `hasMore` so the next "+N" can
  // refetch the rows that were just dropped. Surfaces the standard `loading`
  // state for ~150ms so the toolbar shows the same skeleton as a forward fetch
  // — purely cosmetic parity, the slice itself is instant.
  const trimLoadedTransactions = useCallback((count: number) => {
    if (!isLiveMode || count <= 0) return;
    setLoading(true);
    setTimeout(() => {
      setTransactions((prev) => {
        const next = prev.slice(0, Math.max(0, prev.length - count));
        loadedCountRef.current = next.length;
        return next;
      });
      setHasMore(true);
      setLoading(false);
    }, 150);
  }, [isLiveMode]);

  return (
    <TransactionDataContext.Provider value={{
      transactions, fieldMeta, loadTransactions, resetToSample, isCustomData, flagDeadEnd,
      setComments, flagDeadEndWithComment,
      isLiveMode, loading, hasMore, totalTransactionsCount, fetchPage, appendBatch, replaceFromBeginning, replaceFromBeginningExcluding, fetchCount,
      trimLoadedTransactions,
      filterDefinitions, filterDefinitionsLoading, fetchFilterDefinitions,
      userFilterDefinitions, userFilterDefinitionsLoading, fetchUserFilterDefinitions,
      decimalMaxValues, fetchDecimalMaxValues,
      setAnchorColumn,
    }}>
      {children}
    </TransactionDataContext.Provider>
  );
}
