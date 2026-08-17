export interface TransactionRow {
  [key: string]: string | number | boolean | null;
}

export interface TransactionData {
  Transactions: TransactionRow[];
}

export interface CheckoutState {
  bank: string;
  side: string;
  /** The checked-out library's DataSetType (MT940 / MT942 / INTERIM_MT940 /
   *  Ledger). Scopes the grid, filters, and stats. For every type except
   *  Ledger the identity is (bank, side); for Ledger it is (clientCode,
   *  erpCode) and bank/side are '' (see src/utils/libraryIdentity.ts). */
  dataSetType: string;
  /** Ledger identity. Set only when dataSetType === 'Ledger'; '' otherwise. */
  clientCode?: string;
  erpCode?: string;
  operatorName?: string;
  /** When set, TransactionsTab auto-opens this definition in the rule builder on mount */
  pendingDefinitionId?: string;
}
