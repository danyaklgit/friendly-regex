import type { TransactionRow } from '../types';

// --- Request types ---

export interface FilterProperty {
  ColumnName: string;
  Value: string;
  Operand: string;
}

export interface SortProperty {
  ColumnName: string;
  SortingLevel: number;
  SortingOrder: 'ASC' | 'DESC';
}

export interface PaginationParams {
  PageIndex: number;
  PageSize: number;
}

export interface GetTransactionsRequest {
  FilteringProperties: FilterProperty[][];
  SortingProperties: SortProperty[];
  Pagination: PaginationParams;
}

// --- TEP header config ---

export interface TepHeaders {
  apiKey: string;
  userId: string;
  activityTag?: string;
  tenantCode: string;
  languageCode: string;
  timeZone: string;
  requestId: string;
}

// --- Default sorting ---

export const DEFAULT_SORTING: SortProperty[] = [
  { ColumnName: 'StatementDate', SortingLevel: 1, SortingOrder: 'ASC' },
  { ColumnName: 'Sequence', SortingLevel: 2, SortingOrder: 'ASC' },
];

const BASE = '/api/tep/api/v1/TEP';

export async function getTransactions(
  request: GetTransactionsRequest,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<{ Transactions: TransactionRow[]; TransactionsCount?: number }> {
  const res = await fetch(`${BASE}/GetMT940Transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: tepHeaders.activityTag ?? 'sit',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}
