export interface TransactionRow {
  [key: string]: string | number | boolean | null;
}

export interface TransactionData {
  Transactions: TransactionRow[];
}

export interface CheckoutState {
  bank: string;
  side: string;
  /** The checked-out library's DataSetType (MT940 / MT942 / INTERIM_MT940).
   *  Scopes the grid, filters, and stats alongside bank + side. */
  dataSetType: string;
  operatorName?: string;
  /** When set, TransactionsTab auto-opens this definition in the rule builder on mount */
  pendingDefinitionId?: string;
}
