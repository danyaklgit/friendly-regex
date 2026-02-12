export interface TransactionRow {
  Name: string;
  [fieldKey: string]: string;
}

export interface TransactionData {
  Transactions: TransactionRow[];
}
