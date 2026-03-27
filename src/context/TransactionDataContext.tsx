import { createContext, useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from 'react';
import type { TransactionRow } from '../types';
import { deriveFieldMeta, type FieldMeta } from '../utils/deriveFieldMeta';
import { translateFilters } from '../utils/translateFilters';
import { getTransactions, getFilters, DEFAULT_SORTING, type TepHeaders, type FilterDefinition, type FilterProperty } from '../api/transactions';
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
  flagDeadEnd: (ids: string[], value: boolean) => void;
  // Live mode additions
  isLiveMode: boolean;
  loading: boolean;
  hasMore: boolean;
  totalTransactionsCount: number | null;
  fetchPage: (filters: Record<string, Set<string>>, append: boolean, pageIndex?: number, pageSize?: number, extraFilters?: FilterProperty[]) => Promise<void>;
  fetchCount: (filters: Record<string, Set<string>>, extraFilters?: FilterProperty[]) => Promise<number | null>;
  filterDefinitions: FilterDefinition[];
  filterDefinitionsLoading: boolean;
  fetchFilterDefinitions: () => Promise<void>;
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
  const currentPageRef = useRef(0);
  const loadedCountRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const fieldMeta = useMemo(() => deriveFieldMeta(transactions), [transactions]);

  const loadTransactions = useCallback((rows: TransactionRow[]) => {
    setTransactions(rows);
    setIsCustomData(true);
  }, []);

  const resetToSample = useCallback(() => {
    setTransactions(defaultTransactions);
    setIsCustomData(false);
  }, []);

  const flagDeadEnd = useCallback((ids: string[], value: boolean) => {
    const idSet = new Set(ids);
    setTransactions((prev) =>
      prev.map((row) =>
        idSet.has(String(row[fieldMeta.identifierField] ?? row['Id'] ?? ''))
          ? { ...row, IsDeadEnd: value }
          : row
      )
    );
  }, [fieldMeta.identifierField]);

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

  const fetchPage = useCallback(async (filters: Record<string, Set<string>>, append: boolean, explicitPage?: number, pageSize?: number, extraFilters?: FilterProperty[]) => {
    if (!isLiveMode) return;

    // Auto-refresh session if <5 min remaining
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
          FilteringProperties: [...translateFilters(filters, filterDefinitions), ...(extraFilters ?? [])],
          SortingProperties: DEFAULT_SORTING,
          Pagination: { PageIndex: pageIndex, PageSize: effectivePageSize },
        },
        token,
        tepHeaders,
        controller.signal,
      );

      const rows = data.Transactions ?? [];
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
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('Failed to fetch transactions:', err);
    } finally {
      // Only clear loading if this controller is still the active one
      // (i.e. it wasn't replaced by a newer fetch)
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig, filterDefinitions]);

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
          FilteringProperties: [...translateFilters(filters, filterDefinitions), ...(extraFilters ?? [])],
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
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig, filterDefinitions]);

  // Abort pending requests on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  return (
    <TransactionDataContext.Provider value={{
      transactions, fieldMeta, loadTransactions, resetToSample, isCustomData, flagDeadEnd,
      isLiveMode, loading, hasMore, totalTransactionsCount, fetchPage, fetchCount,
      filterDefinitions, filterDefinitionsLoading, fetchFilterDefinitions,
    }}>
      {children}
    </TransactionDataContext.Provider>
  );
}
