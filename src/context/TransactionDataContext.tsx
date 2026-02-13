import { createContext, useState, useMemo, useCallback, type ReactNode } from 'react';
import type { TransactionRow } from '../types';
import { deriveFieldMeta, type FieldMeta } from '../utils/deriveFieldMeta';
import sampleTransactionData from '../data/sampleData.json';

export interface TransactionDataContextValue {
  transactions: TransactionRow[];
  fieldMeta: FieldMeta;
  loadTransactions: (rows: TransactionRow[]) => void;
  resetToSample: () => void;
  isCustomData: boolean;
}

export const TransactionDataContext = createContext<TransactionDataContextValue | null>(null);

const defaultTransactions = (sampleTransactionData as { Transactions: TransactionRow[] }).Transactions;

export function TransactionDataProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<TransactionRow[]>(defaultTransactions);
  const [isCustomData, setIsCustomData] = useState(false);

  const fieldMeta = useMemo(() => deriveFieldMeta(transactions), [transactions]);

  const loadTransactions = useCallback((rows: TransactionRow[]) => {
    setTransactions(rows);
    setIsCustomData(true);
  }, []);

  const resetToSample = useCallback(() => {
    setTransactions(defaultTransactions);
    setIsCustomData(false);
  }, []);

  return (
    <TransactionDataContext.Provider value={{ transactions, fieldMeta, loadTransactions, resetToSample, isCustomData }}>
      {children}
    </TransactionDataContext.Provider>
  );
}
