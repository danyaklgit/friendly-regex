export interface TransactionRow {
  [key: string]: string | number | boolean | null;
}

export interface TransactionData {
  Transactions: TransactionRow[];
}

export interface CheckoutState {
  bank: string;
  side: string;
  operatorName?: string;
  /** When set, TransactionsTab auto-opens this definition in the rule builder on mount */
  pendingDefinitionId?: string;
}
