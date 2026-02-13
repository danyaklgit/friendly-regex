import { useContext } from 'react';
import { TransactionDataContext } from '../context/TransactionDataContext';

export function useTransactionData() {
  const context = useContext(TransactionDataContext);
  if (!context) throw new Error('useTransactionData must be used within TransactionDataProvider');
  return context;
}
