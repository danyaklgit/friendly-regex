import { createContext, useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from 'react';
import type { TransactionRow } from '../types';
import { deriveFieldMeta, type FieldMeta } from '../utils/deriveFieldMeta';
import { translateFilters } from '../utils/translateFilters';
import { getTransactions, getFilters, getUserFilters, markTransactionsAsDeadEnd, unmarkDeadEndTransactions, setTransactionsComment, DEFAULT_SORTING, type TepHeaders, type FilterDefinition, type FilterProperty, type SetTransactionsCommentEntry } from '../api/transactions';
import { useAuth } from './AuthContext';
import { useTepConfig } from './TepConfigContext';
import sampleTransactionData from '../data/sampleData.json';

const PAGE_SIZE = 50;

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
  fetchPage: (filters: Record<string, Set<string>>, append: boolean, pageIndex?: number, pageSize?: number, extraFilters?: FilterProperty[]) => Promise<TransactionRow[]>;
  fetchCount: (filters: Record<string, Set<string>>, extraFilters?: FilterProperty[]) => Promise<number | null>;
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

  const fetchPage = useCallback(async (filters: Record<string, Set<string>>, append: boolean, explicitPage?: number, pageSize?: number, extraFilters?: FilterProperty[]): Promise<TransactionRow[]> => {
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
          SortingProperties: DEFAULT_SORTING,
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

  const fetchCount = useCallback(async (filters: Record<string, Set<string>>, extraFilters?: FilterProperty[]): Promise<number | null> => {
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
          SortingProperties: DEFAULT_SORTING,
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
      isLiveMode, loading, hasMore, totalTransactionsCount, fetchPage, fetchCount,
      trimLoadedTransactions,
      filterDefinitions, filterDefinitionsLoading, fetchFilterDefinitions,
      userFilterDefinitions, userFilterDefinitionsLoading, fetchUserFilterDefinitions,
      decimalMaxValues, fetchDecimalMaxValues,
    }}>
      {children}
    </TransactionDataContext.Provider>
  );
}
