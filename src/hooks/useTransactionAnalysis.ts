import { useMemo } from 'react';
import { useTagSpecs } from './useTagSpecs';
import { useTransactionData } from './useTransactionData';
import { analyzeRow } from '../utils';
import type { AnalyzedTransaction } from '../types';

export function useTransactionAnalysis(): AnalyzedTransaction[] {
  const { libraries } = useTagSpecs();
  const { transactions, isLiveMode } = useTransactionData();

  return useMemo(
    () =>
      transactions.map((row) => ({
        row,
        analysis: analyzeRow(row, libraries, isLiveMode),
      })),
    [transactions, libraries, isLiveMode]
  );
}
