import type { VIPCustomer, VIPOrgName, VIPAccountName } from '../api/vipCustomers';

const MAX_LEN = 200;

/** English (fallback: first) org name for display/labels. */
export function orgNameFor(names: VIPOrgName[] | undefined, lang = 'en'): string {
  if (!names || names.length === 0) return '';
  return (names.find((n) => n.LanguageCode === lang)?.OrgName ?? names[0].OrgName) || '';
}

/** English (fallback: first) account name. */
export function accountNameFor(names: VIPAccountName[] | undefined, lang = 'en'): string {
  if (!names || names.length === 0) return '';
  return (names.find((n) => n.LanguageCode === lang)?.AccountName ?? names[0].AccountName) || '';
}

export interface VIPOrgGroup {
  orgId: string;
  orgNameEn: string;
  orgNameAr: string;
  tenantCode: string;
  accounts: VIPCustomer[];
}

/**
 * Group accounts by `OrgId` (the filter's grouping key). Groups are ordered by
 * English org name then OrgId; accounts within a group by IBAN. The header
 * names come from the FIRST account of the org — matching how the console
 * filter reads its label (see UI_Settings_VIPCustomers).
 */
export function groupByOrg(customers: VIPCustomer[]): VIPOrgGroup[] {
  const byOrg = new Map<string, VIPCustomer[]>();
  for (const c of customers) {
    const arr = byOrg.get(c.OrgId);
    if (arr) arr.push(c);
    else byOrg.set(c.OrgId, [c]);
  }
  const groups: VIPOrgGroup[] = [];
  for (const [orgId, accounts] of byOrg) {
    const sorted = [...accounts].sort((a, b) => a.IBAN.localeCompare(b.IBAN));
    const first = sorted[0];
    groups.push({
      orgId,
      orgNameEn: orgNameFor(first.OrgNames, 'en'),
      orgNameAr: orgNameFor(first.OrgNames, 'ar'),
      tenantCode: first.TenantCode ?? '',
      accounts: sorted,
    });
  }
  groups.sort((a, b) => a.orgNameEn.localeCompare(b.orgNameEn) || a.orgId.localeCompare(b.orgId));
  return groups;
}

/**
 * Validate a customer against the server rules (mirrored client-side so the
 * form blocks before the round trip). Returns the first error message, or null
 * when valid.
 */
export function validateVIPCustomer(c: VIPCustomer): string | null {
  if (!c.OrgId.trim()) return 'Organization ID is required.';
  if (!c.IBAN.trim()) return 'IBAN is required.';
  if (c.IBAN.includes('|')) return 'IBAN must not contain the "|" character.';

  const completeOrgNames = c.OrgNames.filter((n) => n.LanguageCode.trim() && n.OrgName.trim());
  if (completeOrgNames.length === 0) return 'At least one complete customer name (language + name) is required.';
  // Every provided localized entry must be complete (both parts).
  for (const n of c.OrgNames) {
    if ((n.LanguageCode.trim() === '') !== (n.OrgName.trim() === '')) {
      return 'Each customer name needs both a language and a name.';
    }
  }
  for (const n of c.AccountNames ?? []) {
    if ((n.LanguageCode.trim() === '') !== (n.AccountName.trim() === '')) {
      return 'Each account name needs both a language and a name.';
    }
  }

  // Max length 200 on every string field.
  const strings: (string | null | undefined)[] = [
    c.OrgId, c.IBAN, c.TenantCode, c.InternalAccountId, c.AccountNumber, c.Code,
    c.BankCode, c.BBAN, c.CurrencyCode, c.CountryCode,
    ...c.OrgNames.flatMap((n) => [n.LanguageCode, n.OrgName]),
    ...(c.AccountNames ?? []).flatMap((n) => [n.LanguageCode, n.AccountName]),
  ];
  if (strings.some((s) => (s ?? '').length > MAX_LEN)) return `No field may exceed ${MAX_LEN} characters.`;

  return null;
}

/** True when the two customers collide on the unique (OrgId, IBAN) key. */
export function sameOrgIban(a: VIPCustomer, b: VIPCustomer): boolean {
  return a.OrgId.trim() === b.OrgId.trim() && a.IBAN.trim() === b.IBAN.trim();
}

export const VIP_EXPORT_HEADERS = [
  'Org ID', 'Org Name (EN)', 'Org Name (AR)', 'Tenant Code',
  'IBAN', 'BBAN', 'Bank Code', 'Account Number', 'Code', 'Internal Account ID',
  'Currency', 'Country', 'Account Name (EN)', 'Account Name (AR)',
];

/** One flat row per account, org columns repeated, localized names split per
 *  language column. Powers the client-side CSV export. */
export function vipExportRows(customers: VIPCustomer[]): string[][] {
  const rows: string[][] = [];
  for (const g of groupByOrg(customers)) {
    for (const a of g.accounts) {
      rows.push([
        a.OrgId,
        orgNameFor(a.OrgNames, 'en'),
        orgNameFor(a.OrgNames, 'ar'),
        a.TenantCode ?? '',
        a.IBAN,
        a.BBAN ?? '',
        a.BankCode ?? '',
        a.AccountNumber ?? '',
        a.Code ?? '',
        a.InternalAccountId ?? '',
        a.CurrencyCode ?? '',
        a.CountryCode ?? '',
        accountNameFor(a.AccountNames, 'en'),
        accountNameFor(a.AccountNames, 'ar'),
      ]);
    }
  }
  return rows;
}
