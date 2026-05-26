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
  TotalNotTagged: number;
  /** Total transactions matched by the request's `FilteringProperties`,
   *  used to derive total pages on the UI side. Added by the backend on
   *  2026-05-26 alongside the page-by-tag-spec filtering change. */
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
  TotalNotTagged: 0,
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
 * Backend returns a non-2xx with SFM `SFM_NO_TRANSACTIONS_FOUND` when the
 * filtered dataset has no rows. That's a valid empty result, not an error,
 * so we short-circuit to the EMPTY record instead of throwing — same shape
 * as `getTagSpecComments` handles `SFM_NO_TAG_SPEC_COMMENTS_FOUND`.
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
  if (json?.SFM?.Constant === 'SFM_NO_TRANSACTIONS_FOUND') return EMPTY;
  await throwIfNotOk(res, 'Failed to load distinct values');
  return json?.Result ?? EMPTY;
}
