export interface TransactionRow {
  [key: string]: string | number | boolean | null;
}

export interface TransactionData {
  Transactions: TransactionRow[];
}
