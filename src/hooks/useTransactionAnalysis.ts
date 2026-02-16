import { useMemo } from 'react';
import { useTagSpecs } from './useTagSpecs';
import { useTransactionData } from './useTransactionData';
import { analyzeRow } from '../utils';
import type { AnalyzedTransaction } from '../types';

export function useTransactionAnalysis(): AnalyzedTransaction[] {
  const { libraries } = useTagSpecs();
  const { transactions } = useTransactionData();

  return useMemo(
    () =>
      transactions.map((row) => ({
        row,
        analysis: analyzeRow(row, libraries),
      })),
    [transactions, libraries]
  );
}
