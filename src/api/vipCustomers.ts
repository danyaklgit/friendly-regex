import type { TepHeaders } from './transactions';
import { buildHeaders } from './checkout';
import { throwIfNotOk } from './apiError';

const BASE = '/api/tep/api/v1/TEP';

/** Localized customer / account display name. One entry per language. */
export interface VIPOrgName {
  LanguageCode: string;
  OrgName: string;
}
export interface VIPAccountName {
  LanguageCode: string;
  AccountName: string;
}

/**
 * One VIP customer BANK ACCOUNT (one document = one account). Accounts sharing
 * an `OrgId` form a single option in the console's VIP Customers filter,
 * carrying all of that customer's IBANs. See UI_Settings_VIPCustomers.
 */
export interface VIPCustomer {
  /** Absent on create; the SaveVIPCustomer response carries the generated id. */
  Id?: string | null;
  /** The grouping key of the filter — accounts sharing it are ONE option. */
  OrgId: string;
  OrgNames: VIPOrgName[];
  TenantCode?: string | null;
  InternalAccountId?: string | null;
  AccountNumber?: string | null;
  Code?: string | null;
  BankCode?: string | null;
  BBAN?: string | null;
  /** What the VIP filter matches transactions on. Must not contain '|'. */
  IBAN: string;
  CurrencyCode?: string | null;
  CountryCode?: string | null;
  AccountNames?: VIPAccountName[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function str(v: any): string {
  return v == null ? '' : String(v);
}
function nullableStr(v: any): string | null {
  return v == null ? null : String(v);
}
function normalizeOrgNames(raw: any): VIPOrgName[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => ({
    LanguageCode: str(n.LanguageCode ?? n.languageCode),
    OrgName: str(n.OrgName ?? n.orgName),
  }));
}
function normalizeAccountNames(raw: any): VIPAccountName[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => ({
    LanguageCode: str(n.LanguageCode ?? n.languageCode),
    AccountName: str(n.AccountName ?? n.accountName),
  }));
}
function normalizeCustomer(raw: any): VIPCustomer {
  return {
    Id: nullableStr(raw.Id ?? raw.id),
    OrgId: str(raw.OrgId ?? raw.orgId),
    OrgNames: normalizeOrgNames(raw.OrgNames ?? raw.orgNames),
    TenantCode: nullableStr(raw.TenantCode ?? raw.tenantCode),
    InternalAccountId: nullableStr(raw.InternalAccountId ?? raw.internalAccountId),
    AccountNumber: nullableStr(raw.AccountNumber ?? raw.accountNumber),
    Code: nullableStr(raw.Code ?? raw.code),
    BankCode: nullableStr(raw.BankCode ?? raw.bankCode),
    BBAN: nullableStr(raw.BBAN ?? raw.bban),
    IBAN: str(raw.IBAN ?? raw.iban),
    CurrencyCode: nullableStr(raw.CurrencyCode ?? raw.currencyCode),
    CountryCode: nullableStr(raw.CountryCode ?? raw.countryCode),
    AccountNames: normalizeAccountNames(raw.AccountNames ?? raw.accountNames),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getVIPCustomers(
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<VIPCustomer[]> {
  const res = await fetch(`${BASE}/GetVIPCustomers`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'GetVIPCustomers'),
    body: JSON.stringify({}),
    signal,
  });
  await throwIfNotOk(res, 'Failed to fetch VIP customers');
  const json = await res.json();
  const raw = json.VIPCustomers ?? json.vipCustomers ?? [];
  return Array.isArray(raw) ? raw.map(normalizeCustomer) : [];
}

/**
 * Create (no `Id`) or full-replace update (`Id` set). The backend rejects an
 * `Id` that no longer exists (400) — the caller should treat that as
 * "deleted meanwhile" and refresh. Returns the stored customer (with its id).
 */
export async function saveVIPCustomer(
  customer: VIPCustomer,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<VIPCustomer> {
  const res = await fetch(`${BASE}/SaveVIPCustomer`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'SaveVIPCustomer'),
    body: JSON.stringify({ Customer: customer }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to save VIP customer');
  const json = await res.json();
  return normalizeCustomer(json.Customer ?? json.customer ?? customer);
}

export async function deleteVIPCustomer(
  id: string,
  token: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/DeleteVIPCustomer`, {
    method: 'POST',
    headers: buildHeaders(token, tepHeaders, 'DeleteVIPCustomer'),
    body: JSON.stringify({ Id: id }),
    signal,
  });
  await throwIfNotOk(res, 'Failed to delete VIP customer');
}
