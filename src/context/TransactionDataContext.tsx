import { createContext, useState, useMemo, useCallback, useRef, type ReactNode } from 'react';
import type { TransactionRow } from '../types';
import { deriveFieldMeta, type FieldMeta } from '../utils/deriveFieldMeta';
import { translateFilters } from '../utils/translateFilters';
import { getTransactions, DEFAULT_SORTING, type TepHeaders } from '../api/transactions';
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
  fetchPage: (filters: Record<string, Set<string>>, append: boolean) => Promise<void>;
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
  const currentPageRef = useRef(0);

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

  const fetchPage = useCallback(async (filters: Record<string, Set<string>>, append: boolean) => {
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

    const pageIndex = append ? currentPageRef.current + 1 : 0;

    if (!append) {
      setTransactions([]);
    }
    setLoading(true);
    try {
      const data = await getTransactions(
        {
          FilteringProperties: translateFilters(filters),
          SortingProperties: DEFAULT_SORTING,
          Pagination: { PageIndex: pageIndex, PageSize: PAGE_SIZE },
        },
        token,
        tepHeaders,
      );

      const rows = data.Transactions ?? [];
      currentPageRef.current = pageIndex;
      setHasMore(rows.length >= PAGE_SIZE);

      if (append) {
        setTransactions((prev) => [...prev, ...rows]);
      } else {
        setTransactions(rows);
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [isLiveMode, getAuthHeaders, refreshIfNeeded, userId, tepConfig]);

  return (
    <TransactionDataContext.Provider value={{
      transactions, fieldMeta, loadTransactions, resetToSample, isCustomData, flagDeadEnd,
      isLiveMode, loading, hasMore, fetchPage,
    }}>
      {children}
    </TransactionDataContext.Provider>
  );
}
