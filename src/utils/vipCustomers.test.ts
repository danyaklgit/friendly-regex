import { describe, it, expect } from 'vitest';
import type { VIPCustomer } from '../api/vipCustomers';
import {
  groupByOrg,
  validateVIPCustomer,
  sameOrgIban,
  vipExportRows,
  VIP_EXPORT_HEADERS,
  orgNameFor,
} from './vipCustomers';

function cust(overrides: Partial<VIPCustomer> = {}): VIPCustomer {
  return {
    Id: 'id-1',
    OrgId: '150000780016',
    OrgNames: [{ LanguageCode: 'en', OrgName: 'BwaTech' }],
    TenantCode: 'BWATECH',
    IBAN: 'SA0420000002184182559940',
    ...overrides,
  };
}

describe('orgNameFor', () => {
  it('prefers the requested language, falls back to the first entry', () => {
    const names = [{ LanguageCode: 'en', OrgName: 'BwaTech' }, { LanguageCode: 'ar', OrgName: 'بواتك' }];
    expect(orgNameFor(names, 'ar')).toBe('بواتك');
    expect(orgNameFor(names, 'fr')).toBe('BwaTech');
    expect(orgNameFor([], 'en')).toBe('');
  });
});

describe('groupByOrg', () => {
  it('groups accounts by OrgId, orders accounts by IBAN and groups by org name', () => {
    const acme = cust({ OrgId: 'ACME', OrgNames: [{ LanguageCode: 'en', OrgName: 'Acme' }], IBAN: 'SA99' });
    const bwaB = cust({ OrgId: 'BWA', OrgNames: [{ LanguageCode: 'en', OrgName: 'BwaTech' }], IBAN: 'SA02' });
    const bwaA = cust({ OrgId: 'BWA', OrgNames: [{ LanguageCode: 'en', OrgName: 'BwaTech' }], IBAN: 'SA01' });

    const groups = groupByOrg([bwaB, acme, bwaA]);
    expect(groups.map((g) => g.orgId)).toEqual(['ACME', 'BWA']); // by en name
    const bwa = groups.find((g) => g.orgId === 'BWA')!;
    expect(bwa.accounts.map((a) => a.IBAN)).toEqual(['SA01', 'SA02']); // by IBAN
    expect(bwa.orgNameEn).toBe('BwaTech');
  });
});

describe('validateVIPCustomer', () => {
  it('accepts a complete customer', () => {
    expect(validateVIPCustomer(cust())).toBeNull();
  });
  it('requires OrgId and IBAN', () => {
    expect(validateVIPCustomer(cust({ OrgId: '  ' }))).toMatch(/Organization ID/);
    expect(validateVIPCustomer(cust({ IBAN: '' }))).toMatch(/IBAN is required/);
  });
  it('rejects a pipe in the IBAN (it rides the filter as a |-joined set)', () => {
    expect(validateVIPCustomer(cust({ IBAN: 'SA01|SA02' }))).toMatch(/must not contain/);
  });
  it('requires at least one complete OrgNames entry', () => {
    expect(validateVIPCustomer(cust({ OrgNames: [] }))).toMatch(/at least one complete customer name/i);
    expect(validateVIPCustomer(cust({ OrgNames: [{ LanguageCode: 'en', OrgName: '' }] }))).toMatch(/at least one complete/i);
  });
  it('rejects a half-filled localized name (language without name)', () => {
    expect(validateVIPCustomer(cust({
      OrgNames: [{ LanguageCode: 'en', OrgName: 'BwaTech' }, { LanguageCode: 'ar', OrgName: '' }],
    }))).toMatch(/both a language and a name/);
  });
  it('enforces the 200-char cap', () => {
    expect(validateVIPCustomer(cust({ BankCode: 'x'.repeat(201) }))).toMatch(/200 characters/);
  });
});

describe('sameOrgIban', () => {
  it('detects the unique-key collision', () => {
    expect(sameOrgIban(cust(), cust())).toBe(true);
    expect(sameOrgIban(cust(), cust({ IBAN: 'SA0000' }))).toBe(false);
    expect(sameOrgIban(cust(), cust({ OrgId: 'OTHER' }))).toBe(false);
  });
});

describe('vipExportRows', () => {
  it('flattens one row per account with org columns repeated and names split by language', () => {
    const rows = vipExportRows([
      cust({
        OrgNames: [{ LanguageCode: 'en', OrgName: 'BwaTech' }, { LanguageCode: 'ar', OrgName: 'بواتك' }],
        IBAN: 'SA01', BankCode: 'RIBLSARI', CurrencyCode: 'SAR', CountryCode: 'SA',
        AccountNames: [{ LanguageCode: 'en', AccountName: 'Riyad Bank' }, { LanguageCode: 'ar', AccountName: 'بنك الرياض' }],
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].length).toBe(VIP_EXPORT_HEADERS.length);
    expect(rows[0][0]).toBe('150000780016'); // OrgId
    expect(rows[0][1]).toBe('BwaTech');       // en org name
    expect(rows[0][2]).toBe('بواتك');         // ar org name
    expect(rows[0][4]).toBe('SA01');          // IBAN
    expect(rows[0][12]).toBe('Riyad Bank');   // en account name
    expect(rows[0][13]).toBe('بنك الرياض');   // ar account name
  });
});
