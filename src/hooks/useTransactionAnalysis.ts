import { useMemo } from 'react';
import { useTagSpecs } from './useTagSpecs';
import { analyzeRow } from '../utils';
import type { TransactionRow, RowAnalysisResult } from '../types';
import sampleTransactionData from '../data/sampleData.json';

export interface AnalyzedTransaction {
  row: TransactionRow;
  analysis: RowAnalysisResult;
}

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
