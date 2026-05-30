import type { FilterProperty, PaginationParams, SortProperty, TepHeaders } from './transactions';
import { buildHeaders } from './checkout';
import { throwIfNotOk } from './apiError';

const BASE = '/api/tep/api/v1/TEP';

export interface DistinctFieldValueItem {
  FieldValue: string;
  Count: number;
  IsValid: boolean | null;
}

export interface DistinctFieldValuesResult {
  Items: DistinctFieldValueItem[];
  TotalDistinctCount: number;
  TotalValidated: number;
  TotalNotValid: number;
  /** Replaces `TotalNotTagged` (backend rename, 2026-05-30): IsValid == null
   *  is semantically "nothing was validated against this value", not
   *  "untagged". The old field is still emitted by the backend during the
   *  migration window and mirrored here for compatibility. */
  TotalNotValidated: number;
  /** Deprecated: superseded by `TotalNotValidated`. Same numeric value while
   *  the backend dual-emits; will be removed once the migration is done.
   *  Read sites should prefer `TotalNotValidated`. */
  TotalNotTagged?: number;
  /** Renamed from `TransactionsCount` to `DistinctValuesCount` on
   *  2026-05-30 — it counts distinct values, not transactions. Drives the
   *  UI's total-pages calculation. */
  DistinctValuesCount?: number;
  /** Deprecated alias kept while the backend dual-emits both names. */
  TransactionsCount?: number;
}

export interface GetDistinctFieldValuesRequest {
  FieldName: string;
  FilteringProperties?: FilterProperty[];
  SortingProperties?: SortProperty[];
  Pagination?: PaginationParams;
}

const EMPTY: DistinctFieldValuesResult = {
  Items: [],
  TotalDistinctCount: 0,
  TotalValidated: 0,
  TotalNotValid: 0,
  TotalNotValidated: 0,
  TotalNotTagged: 0,
  DistinctValuesCount: 0,
  TransactionsCount: 0,
};

interface GetDistinctFieldValuesResponse {
  Result?: DistinctFieldValuesResult;
  SFM?: {
    Constant?: string | null;
    Major?: { Constant?: string | null };
  };
}

/**
 * Backend signals an empty result via SFM on a non-2xx status. The constant
 * is migrating from `SFM_NO_TRANSACTIONS_FOUND` to `SFM_NO_DISTINCT_VALUES_FOUND`
 * (the endpoint paginates distinct values, not transactions). Accept both
 * while the backend dual-emits, and normalise to EMPTY so callers don't have
 * to branch on the SFM tag. Mirrors how `getTagSpecComments` handles
 * `SFM_NO_TAG_SPEC_COMMENTS_FOUND`.
 *
 * After the SFM short-circuit, fold the deprecated field aliases
 * (`TransactionsCount` -> `DistinctValuesCount`, `TotalNotTagged` ->
 * `TotalNotValidated`) so call sites can read the new names exclusively
 * while the old payload shape is still arriving from the wire.
 */
export async function getDistinctFieldValues(
  req: GetDistinctFieldValuesRequest,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<DistinctFieldValuesResult> {
  const res = await fetch(`${BASE}/GetDistinctFieldValues`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetDistinctFieldValues'),
    body: JSON.stringify(req),
    signal,
  });
  let json: GetDistinctFieldValuesResponse | null = null;
  try {
    json = (await res.clone().json()) as GetDistinctFieldValuesResponse;
  } catch {
    json = null;
  }
  const sfm = json?.SFM?.Constant;
  if (sfm === 'SFM_NO_DISTINCT_VALUES_FOUND' || sfm === 'SFM_NO_TRANSACTIONS_FOUND') {
    return EMPTY;
  }
  await throwIfNotOk(res, 'Failed to load distinct values');
  const result = json?.Result;
  if (!result) return EMPTY;
  // Backwards-compatible shape: prefer the new fields when the backend
  // emits them, otherwise read the old aliases. The result type now
  // requires `TotalNotValidated`, so falling back to `TotalNotTagged ?? 0`
  // keeps the type contract intact even on a fully legacy response.
  return {
    ...result,
    TotalNotValidated: result.TotalNotValidated ?? result.TotalNotTagged ?? 0,
    DistinctValuesCount: result.DistinctValuesCount ?? result.TransactionsCount,
  };
}
