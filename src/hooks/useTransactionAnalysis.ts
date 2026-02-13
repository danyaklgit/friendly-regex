import { useMemo } from 'react';
import { useTagSpecs } from './useTagSpecs';
import { analyzeRow } from '../utils';
import type { TransactionRow, AnalyzedTransaction } from '../types';
import sampleTransactionData from '../data/sampleData.json';

export function useTransactionAnalysis(): AnalyzedTransaction[] {
  const { tagDefinitions } = useTagSpecs();
  const transactions = (sampleTransactionData as { Transactions: TransactionRow[] }).Transactions;

  return useMemo(
    () =>
      transactions.map((row) => ({
        row,
        analysis: analyzeRow(row, tagDefinitions),
      })),
    [transactions, tagDefinitions]
  );
}
