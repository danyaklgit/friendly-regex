import { createContext, useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from 'react';
import type { TransactionRow } from '../types';
import { deriveFieldMeta, type FieldMeta } from '../utils/deriveFieldMeta';
import { translateFilters } from '../utils/translateFilters';
import { getTransactions, getFilters, getUserFilters, markTransactionsAsDeadEnd, unmarkDeadEndTransactions, setTransactionsComment, DEFAULT_SORTING, type TepHeaders, type FilterDefinition, type FilterProperty, type SetTransactionsCommentEntry, type SortProperty } from '../api/transactions';
import { useAuth } from './AuthContext';
import { useTepConfig } from './TepConfigContext';
import sampleTransactionData from '../data/sampleData.json';

// Default page size for the initial Transactions load + every
// filter-change refetch + classic pagination's Next/Previous. Stays at
// 50 so the first paint is light — operators landing on the tab see
// 50 rows immediately rather than waiting for 200 to transfer + render.
//
// +N pagination buttons (Show all included) bypass this default and
// pass an explicit `pageSize` to `replaceFromBeginning` — the backend
// confirmed `PageSize` is uncapped, so any +N click collapses to a
// single round trip whose size matches what the operator asked for
// (`+200` = 200 rows in one request, Show all = totalCount rows in one
// request). PAGE_SIZE only governs the implicit "first batch" cost.
//
// Classic pagination (Next / Previous) shares BATCH_SIZE = 50 with the
// client-side slice math in TransactionsTab, so keeping the two
// constants aligned at 50 also keeps the offset arithmetic consistent
// (PageIndex × PageSize === slice(currentPage × BATCH_SIZE, ...)).
export const PAGE_SIZE = 50;

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
   *  why this lives separate from `fetchPage`. Returns the merged rows in
   *  `pageIndices` order. Resolves with an empty array on error or non-
   *  live mode. */
  appendBatch: (filters: Record<string, Set<string>>, pageIndices: number[], extraFilters?: FilterProperty[], sortingProperties?: SortProperty[]) => Promise<TransactionRow[]>;
  /** Fetch the first N rows in ONE request and replace the buffer
   *  atomically (no pre-fetch clear / flicker). Used by `+N` pagination
   *  and `Show all` now that backend `PageSize` is uncapped — one round
   *  trip per click instead of `ceil(N / PAGE_SIZE)` aligned pages. */
  replaceFromBeginning: (filters: Record<string, Set<string>>, pageSize: number, extraFilters?: FilterProperty[], sortingProperties?: SortProperty[]) => Promise<TransactionRow[]>;
  fetchCount: (filters: Record<string, Set<string>>, extraFilters?: FilterProperty[], sortingProperties?: SortProperty[]) => Promise<number | null>;
  trimLoadedTransactions: (count: number) => void;
  filterDefinitions: FilterDefinition[];
  filterDefinitionsLoading: boolean;
  fetchFilterDefinitions: () => Promise<void>;
  /** User-screen filter definitions, fetched from GetUserFilters. Kept
   *  separate from the operator `filterDefinitions` so the user table's
   *  TransactionType label lookup (which reads `filterDefinitions`) is
   *  unaffected by the user-mode filter bar. */
  userFilterDefinitions: FilterDefinition[];
  userFilterDefinitionsLoading: boolean;
  /** Fetch user-screen filters. Pass selected bank SWIFT codes to narrow the
   *  BANKS filter and receive the ATTR:* attribute filters (union of their
   *  values). Omit on the first call (bank picker) to list all banks. */
  fetchUserFilterDefinitions: (banks?: string[]) => Promise<void>;
  decimalMaxValues: Map<string, number>;
  fetchDecimalMaxValues: (filterDefs: FilterDefinition[]) => Promise<void>;
}

export const TransactionDataContext = createContext<TransactionDataContextValue | null>(null);

const defaultTransactions = (sampleTransactionData as unknown as { Transactions: TransactionRow[] }).Transactions;

export function TransactionDataProvider({ children }: { children: ReactNode }) {
  const { useDummyData, userId, getAuthHeaders, refreshIfNeeded } = useAuth();
  const tepConfig = useTepConfig();
  const isLiveMode = !useDummyData;

  const [transactions, setTransactions] = useState<TransactionRow[]>(useDummyData ? defaultTransactions : []);
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
  // Mirror filterDefinitions into a ref so `fetchPage` / `fetchCount` can read
  // them without listing the array in their dependency arrays. Listing them
  // would churn the callback identity every time GetFilters returns, which
  // re-fires every downstream effect that has fetchPage as a dep — and that
  // includes the live-fetch effect in TransactionsTab, causing GetMT940Transactions
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
    setTransactions(defaultTransactions);
    setIsCustomData(false);
  }, []);

  const flagDeadEnd = useCallback(async (ids: string[], value: boolean) => {
    if (isLiveMode) {
      await refreshIfNeeded();
      const authHeaders = getAuthHeaders();
      const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
      const tepHeaders: TepHeaders = {
        apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
        userId: userId ?? '',
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
      const tepHeaders: TepHeaders = {
        apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
        userId: userId ?? '',
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
  const fetchFilterDefinitions = useCallback(async () => {
    if (!isLiveMode || filterFetchingRef.current) return;
    filterFetchingRef.current = true;
    try {
      await refreshIfNeeded();
      const authHeaders = getAuthHeaders();
      const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
      if (!token) return;
      const tepHeaders: TepHeaders = {
        apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
        userId: userId ?? '',
        tenantCode: tepConfig.ttpTenantCode,
        languageCode: tepConfig.languageCode,
        timeZone: tepConfig.timeZone,
        requestId: tepConfig.ttpRequestId,
      };
      setFilterDefinitionsLoading(true);
      const defs = await getFilters('MT940', token, tepHeaders);
      setFilterDefinitions(defs);
    } catch (err) {
      console.error('Failed to fetch filter definitions:', err);
    } finally {
      setFilterDefinitionsLoading(false);
      filterFetchingRef.current = false;
    }
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  const userFilterFetchingRef = useRef(false);
  const fetchUserFilterDefinitions = useCallback(async (banks?: string[]) => {
    if (!isLiveMode || userFilterFetchingRef.current) return;
    userFilterFetchingRef.current = true;
    try {
      await refreshIfNeeded();
      const authHeaders = getAuthHeaders();
      const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
      if (!token) return;
      const tepHeaders: TepHeaders = {
        apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
        userId: userId ?? '',
        tenantCode: tepConfig.ttpTenantCode,
        languageCode: tepConfig.languageCode,
        timeZone: tepConfig.timeZone,
        requestId: tepConfig.ttpRequestId,
      };
      setUserFilterDefinitionsLoading(true);
      const defs = await getUserFilters('MT940', token, tepHeaders, undefined, banks);
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
    const tepHeaders: TepHeaders = {
      apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
      userId: userId ?? '',
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

    const tepHeaders: TepHeaders = {
      apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
      userId: userId ?? '',
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

      if (!append && data.TransactionsCount != null) {
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
   * update. Used by `loadNVisible` / "Show all" to collapse the previous
   * "fetch page N, await, fetch page N+1, await…" loop into one batched
   * round of concurrent requests — wall-clock becomes max(latency) instead
   * of sum(latency).
   *
   * Why a separate method from `fetchPage`:
   *
   *  - `fetchPage` calls `abortRef.current?.abort()` to enforce
   *    single-flight semantics (filter-change races). Firing several of
   *    them in parallel would cancel each other. `appendBatch` deliberately
   *    skips the abort dance because every call here is for a different,
   *    non-conflicting page of the SAME query.
   *  - `fetchPage`'s pageIndex math reads `loadedCountRef.current` and
   *    would compute the same index for every concurrent invocation
   *    (they all see the pre-batch loadedCount), producing duplicates.
   *    Callers of `appendBatch` precompute the exact page indices they
   *    want, so each parallel request targets a distinct slice.
   *
   * Results merge in the requested `pageIndices` order so the table stays
   * consistent with the backend's pagination ordering even if some pages
   * arrive faster than others. The deduplicated `setTransactions` happens
   * once at the end — no flicker.
   */
  const appendBatch = useCallback(async (
    filters: Record<string, Set<string>>,
    pageIndices: number[],
    extraFilters?: FilterProperty[],
    sortingProperties?: SortProperty[],
  ): Promise<TransactionRow[]> => {
    if (!isLiveMode) return [];
    if (pageIndices.length === 0) return [];

    await refreshIfNeeded();
    const authHeaders = getAuthHeaders();
    const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
    if (!token) return [];
    const tepHeaders: TepHeaders = {
      apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
      userId: userId ?? '',
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
    const filteringProperties = [...translateFilters(filters, filterDefinitionsRef.current), ...(extraFilters ?? [])];

    setLoading(true);
    try {
      // Fire all page requests in parallel. The browser caps concurrent
      // requests per origin (~6 for HTTP/1, much higher for HTTP/2); we
      // don't need to throttle manually. Each request is independent —
      // no abort signal because cancelling a partial batch would leave
      // the buffer in an inconsistent state mid-fetch. The standard
      // filter-change refetch path still owns single-flight semantics.
      const results = await Promise.all(
        pageIndices.map((pageIndex) =>
          getTransactions(
            {
              FilteringProperties: filteringProperties,
              SortingProperties: sortingProperties ?? DEFAULT_SORTING,
              Pagination: { PageIndex: pageIndex, PageSize: PAGE_SIZE },
            },
            token,
            tepHeaders,
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
      let highestIndex = pageIndices[0];
      for (const { pageIndex, data } of results) {
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
        if (pageIndex > highestIndex) highestIndex = pageIndex;
      }

      currentPageRef.current = highestIndex;
      // hasMore mirrors fetchPage's contract: full last page means more
      // is likely available; short last page (or empty) means we've
      // exhausted the dataset.
      setHasMore(lastPageRows >= PAGE_SIZE);
      setTransactions((prev) => {
        const next = [...prev, ...merged];
        loadedCountRef.current = next.length;
        return next;
      });
      return merged;
    } catch (err) {
      console.error('Failed to batch-fetch transactions:', err);
      return [];
    } finally {
      setLoading(false);
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
   * The previous parallel `appendBatch` path stays available for any
   * future caller that genuinely needs append semantics, but the
   * standard +N / Show all flows go through here.
   */
  const replaceFromBeginning = useCallback(async (
    filters: Record<string, Set<string>>,
    pageSize: number,
    extraFilters?: FilterProperty[],
    sortingProperties?: SortProperty[],
  ): Promise<TransactionRow[]> => {
    if (!isLiveMode) return [];
    if (pageSize <= 0) return [];

    await refreshIfNeeded();
    const authHeaders = getAuthHeaders();
    const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
    if (!token) return [];
    const tepHeaders: TepHeaders = {
      apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
      userId: userId ?? '',
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
          Pagination: { PageIndex: 0, PageSize: pageSize },
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
      currentPageRef.current = 0;
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

  const fetchCount = useCallback(async (filters: Record<string, Set<string>>, extraFilters?: FilterProperty[], sortingProperties?: SortProperty[]): Promise<number | null> => {
    if (!isLiveMode) return null;
    await refreshIfNeeded();
    const authHeaders = getAuthHeaders();
    const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
    if (!token) return null;
    const tepHeaders: TepHeaders = {
      apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
      userId: userId ?? '',
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
        },
        token,
        tepHeaders,
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
      isLiveMode, loading, hasMore, totalTransactionsCount, fetchPage, appendBatch, replaceFromBeginning, fetchCount,
      trimLoadedTransactions,
      filterDefinitions, filterDefinitionsLoading, fetchFilterDefinitions,
      userFilterDefinitions, userFilterDefinitionsLoading, fetchUserFilterDefinitions,
      decimalMaxValues, fetchDecimalMaxValues,
    }}>
      {children}
    </TransactionDataContext.Provider>
  );
}
