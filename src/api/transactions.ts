import type { TransactionRow } from '../types';

// --- Request types ---

export interface RegexCondition {
  ColumnName: string;
  Value: string;
  Options: string;
}

export interface StandardFilterProperty {
  ColumnName: string;
  Value: string;
  Operand: string;
}

export interface RegexFilterProperty {
  Operand: 'REGEX';
  Regex: RegexCondition[][];
}

export type FilterProperty = StandardFilterProperty | RegexFilterProperty;

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
  FilteringProperties: FilterProperty[];
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

// --- Filter definitions (from GetFilters API) ---

export type FilterType = 'LIST' | 'SEARCH' | 'DECIMAL' | 'DATE';

export interface FilterValue {
  Column: string;
  Value: string | null;
  Label: string;
  Operand: string | null;
  DisabledBy: string | null;
}

export interface FilterDefinition {
  Tag: string;
  Label: string;
  Type: FilterType;
  Operand: string | null;
  IsFilterSearchable?: boolean;
  Values: FilterValue[];
}

export interface GetFiltersResponse {
  Filters: FilterDefinition[];
}

// --- Backlog stats (from GetBacklogStats API) ---

export interface BacklogStatEntry {
  TagSpecLibraryId: string;
  TotalTransactionCount: number;
  TotalTaggedCount: number;
  TaggingRate: number;
  FullyTaggedCount: number;
  TaggedWithMissingMandatoryAttrCount: number;
  TaggedWithMissingOptionalAttrCount: number;
  TaggedWithInvalidAttrCount: number;
  UntaggedCount: number;
  MultiTaggedCount: number;
  DeadEndCount: number;
}

export interface GetBacklogStatsResponse {
  BacklogStats: BacklogStatEntry[];
}

const BASE = '/api/tep/api/v1/TEP';

export async function getFilters(
  dataSetType: string,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<FilterDefinition[]> {
  const res = await fetch(`${BASE}/GetFilters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'GetFilters',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ DataSetType: dataSetType }),
    signal,
  });

  if (!res.ok) throw new Error('Failed to fetch filters');
  const data: GetFiltersResponse = await res.json();
  return data.Filters;
}

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

export async function getBacklogStats(
  dataSetType: string,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<BacklogStatEntry[]> {
  const res = await fetch(`${BASE}/GetBacklogStats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'GetBacklogStats',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ DataSetType: dataSetType }),
    signal,
  });

  if (!res.ok) throw new Error('Failed to fetch backlog stats');
  const data: GetBacklogStatsResponse = await res.json();
  return data.BacklogStats;
}
