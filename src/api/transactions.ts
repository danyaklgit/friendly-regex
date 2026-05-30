import type { TransactionRow } from '../types';
import { throwIfNotOk } from './apiError';

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
  SubLabel?: string | null;
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
  IssuesCount: number;
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

  await throwIfNotOk(res, 'Failed to fetch filters');
  const data: GetFiltersResponse = await res.json();
  return data.Filters;
}

/**
 * User-screen counterpart of {@link getFilters}. Returns the same `Filter`
 * contract (so the same renderer drives both screens), but from the
 * `GetUserFilters` endpoint, which serves the user account / transactions
 * screen (Tags, Group Tags, Accounts, Side, Currency, Amount, Statement Date,
 * IBAN search, free-text Search). See GetUserFilters-API.md.
 */
export async function getUserFilters(
  dataSetType: string,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<FilterDefinition[]> {
  const res = await fetch(`${BASE}/GetUserFilters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'GetUserFilters',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ DataSetType: dataSetType }),
    signal,
  });

  await throwIfNotOk(res, 'Failed to fetch user filters');
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
      ActivityTag: 'GetMT940Transactions',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify(request),
    signal,
  });

  await throwIfNotOk(res, 'Failed to fetch transactions');
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

  await throwIfNotOk(res, 'Failed to fetch backlog stats');
  const data: GetBacklogStatsResponse = await res.json();
  return data.BacklogStats;
}

// --- GetAllTransactionTags (live preview of matching tags during rule authoring) ---

export interface GetAllTransactionTagsRequest {
  FilteringProperties: FilterProperty[];
}

export interface GetAllTransactionTagsResponse {
  OpsTagSpecIds: string[];
  // SFM envelope is acknowledged but not validated client-side; HTTP status
  // determines success/failure via throwIfNotOk.
  SFM?: unknown;
}

export async function getAllTransactionTags(
  request: GetAllTransactionTagsRequest,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await fetch(`${BASE}/GetAllTransactionTags`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'GetAllTransactionTags',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify(request),
    signal,
  });

  await throwIfNotOk(res, 'Failed to fetch matching transaction tags');
  const data: GetAllTransactionTagsResponse = await res.json();
  return data.OpsTagSpecIds ?? [];
}

export async function markTransactionsAsDeadEnd(
  ids: string[],
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/MarkTransactionsAsDeadEnd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'MarkTransactionsAsDeadEnd',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ Ids: ids }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to mark transactions as dead end');
}

export async function unmarkDeadEndTransactions(
  ids: string[],
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/UnmarkDeadEndTransactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'UnmarkDeadEndTransactions',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ Ids: ids }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to unmark dead end transactions');
}

export interface SetTransactionsCommentEntry {
  Id: string;
  Comment: string | null;
}

export async function setTransactionsComment(
  entries: SetTransactionsCommentEntry[],
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/SetTransactionsComment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'SetTransactionsComment',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ Transactions: entries }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to set transactions comment');
}

// --- Integration Logs ---------------------------------------------------------

export interface IntegrationLog {
  Id: string;
  Endpoint: string;
  StatementId: string;
  RequestFilePath: string;
  ResponseFilePath: string;
  CallStartDate: string;
  CallEndDate: string;
  StatusType: string | null;
  StatusCode: string | null;
  StatusDescription: string | null;
}

export interface GetIntegrationLogsRequest {
  Endpoint?: string | null;
  StatementId?: string | null;
  StatusType?: string | null;
  StatusCode?: string | null;
  /** ISO-like 'YYYY-MM-DDTHH:mm:ss', no timezone. */
  FromDate?: string | null;
  ToDate?: string | null;
  Page?: number;
  PageSize?: number;
}

export interface GetIntegrationLogsResponse {
  Items: IntegrationLog[];
  Total: number;
  Page: number;
  PageSize: number;
  SFM?: unknown;
}

export type IntegrationLogFileType = 'REQUEST' | 'RESPONSE';

export interface GetIntegrationLogFileResponse {
  Content: string;
  SFM?: unknown;
}

export async function getIntegrationLogs(
  request: GetIntegrationLogsRequest,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<GetIntegrationLogsResponse> {
  const res = await fetch(`${BASE}/GetIntegrationLogs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'GetIntegrationLogs',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify(request),
    signal,
  });

  await throwIfNotOk(res, 'Failed to fetch integration logs');
  return res.json();
}

export async function getIntegrationLogFile(
  request: { Id: string; FileType: IntegrationLogFileType },
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<GetIntegrationLogFileResponse> {
  const res = await fetch(`${BASE}/GetIntegrationLogFile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'GetIntegrationLogFile',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify(request),
    signal,
  });

  await throwIfNotOk(res, 'Failed to fetch integration log file');
  return res.json();
}

export async function rerunIntegrationRequest(
  id: string,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/RerunIntegrationRequest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'RerunIntegrationRequest',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ Id: id }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to re-run integration request');
}
