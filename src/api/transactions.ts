import type { TransactionRow } from '../types';
import { ApiError, throwIfNotOk } from './apiError';

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

// Columns the operator may sort the transactions table by. Kept as a
// const tuple so the literal type drives both the override shape and the
// TransactionTable header click handler.
export const SORTABLE_FIELDS = [
  'IBAN',
  'BankReference',
  'Description1',
  'Description2',
  'AdditionalInformation',
] as const;

export type SortableField = (typeof SORTABLE_FIELDS)[number];

export interface SortOverride {
  field: SortableField;
  order: 'ASC' | 'DESC';
}

/**
 * Build the SortingProperties payload sent to the backend (or used by the
 * client-side sorter in sample / upload mode). When no override is active
 * the default StatementDate + Sequence ordering is used as-is. When an
 * override is active the user's column becomes the primary sort and the
 * default ordering drops to a secondary / tertiary tiebreaker so rows with
 * equal values stay in a predictable date order.
 */
export function buildSortingProperties(override: SortOverride | null | undefined): SortProperty[] {
  if (!override) return DEFAULT_SORTING;
  return [
    { ColumnName: override.field, SortingLevel: 1, SortingOrder: override.order },
    { ColumnName: 'StatementDate', SortingLevel: 2, SortingOrder: 'ASC' },
    { ColumnName: 'Sequence', SortingLevel: 3, SortingOrder: 'ASC' },
  ];
}

const SORTABLE_FIELD_SET: ReadonlySet<string> = new Set(SORTABLE_FIELDS);

/**
 * Validate an unknown value (typically from localStorage) as a SortOverride
 * and return it, or null when the shape is unexpected. Rejecting unknown
 * fields here protects against renamed columns silently sorting on a field
 * the backend no longer knows.
 */
export function parseSortOverride(raw: unknown): SortOverride | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { field?: unknown; order?: unknown };
  if (typeof obj.field !== 'string' || !SORTABLE_FIELD_SET.has(obj.field)) return null;
  if (obj.order !== 'ASC' && obj.order !== 'DESC') return null;
  return { field: obj.field as SortableField, order: obj.order };
}

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
  banks?: string[],
): Promise<FilterDefinition[]> {
  const res = await fetch(`${BASE}/GetUserFilters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      ActivityTag: 'GetUserFilters',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    // `Banks` (SWIFT codes) narrows the BANKS filter to those banks and returns
    // the attribute (ATTR:*) filters with the union of their values. Omitted on
    // the first call (bank picker), which returns all banks + all attr values.
    body: JSON.stringify({ DataSetType: dataSetType, ...(banks && banks.length > 0 ? { Banks: banks } : {}) }),
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
  const res = await fetch(`${BASE}/GetTEPTransactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Backend gzips the response on this endpoint when the dataset
      // is large (e.g. Show all on 40k+ rows). Browsers send
      // Accept-Encoding by default for GET, but for fetch + POST some
      // proxies / middlewares only forward compression when the
      // client signals support explicitly. Setting it here makes the
      // contract unambiguous: the request opts in, the backend
      // responds with Content-Encoding: gzip, the browser
      // transparently decompresses before res.json() runs. Cuts the
      // wire payload by ~10x on the heavy Show-all path.
      'Accept-Encoding': 'gzip',
      Authorization: `Bearer ${authToken}`,
      ActivityTag: 'GetTEPTransactions',
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
  dataSetTypes: string[],
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
      ActivityTag: 'GetBacklogStats',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    // `DataSetTypes` (a real JSON array), matching GetTagSpecLibraries — one
    // call returns stats for every workspace, each entry keyed by its own
    // TagSpecLibraryId.
    body: JSON.stringify({ DataSetTypes: dataSetTypes }),
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

// --- Bulk PushProcessedStatement rerun (async job) ----------------------------
//
// These two calls follow the RerunPushProcessedStatements contract. Unlike the
// rest of this module they DO NOT use throwIfNotOk: the contract maps
// SFM_GENERAL_ERROR onto HTTP 400/500, so the body must be read on any status
// and the caller branches on SFM.Constant (and, for the poll, Progress.Status).
// Only a genuinely unparseable body (transport failure) throws.

export interface RerunFailedStatement {
  Id: string;
  ErrorMessage: string;
}

export type RerunJobStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface RerunJobProgress {
  Id: string;
  FromId: string;
  TotalStatements: number;
  ProcessedStatements: number;
  FailedCount: number;
  Status: RerunJobStatus;
  StartedAt: string;
  CompletedAt: string | null;
  PhaseMessage: string;
  ErrorMessage: string | null;
  FailedStatements: RerunFailedStatement[];
}

export interface RerunPushProcessedStatementsResponse {
  /** Null when there was nothing to rerun. */
  JobId: string | null;
  ResultDescription: string;
  SFM: { Constant: string };
}

export interface GetRerunProgressResponse {
  Progress: RerunJobProgress | null;
  ResultDescription: string;
  SFM: { Constant: string };
}

export async function rerunPushProcessedStatements(
  fromId: string,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<RerunPushProcessedStatementsResponse> {
  const res = await fetch(`${BASE}/RerunPushProcessedStatements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      ActivityTag: 'RerunPushProcessedStatements',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ FromId: fromId }),
    signal,
  });
  try {
    return (await res.json()) as RerunPushProcessedStatementsResponse;
  } catch {
    throw new ApiError('Failed to start the bulk rerun job', res.status);
  }
}

export async function getRerunPushProcessedStatementsProgress(
  jobId: string,
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<GetRerunProgressResponse> {
  const res = await fetch(`${BASE}/GetRerunPushProcessedStatementsProgress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      ActivityTag: 'GetRerunPushProcessedStatementsProgress',
      LanguageCode: tepHeaders.languageCode,
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ JobId: jobId }),
    signal,
  });
  try {
    return (await res.json()) as GetRerunProgressResponse;
  } catch {
    throw new ApiError('Failed to read the bulk rerun job progress', res.status);
  }
}
