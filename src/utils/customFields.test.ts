import { describe, it, expect } from 'vitest';
import type { TransactionRow } from '../types';
import { CUSTOM_FIELD_PREFIX, isCustomFieldKey, customFieldLabel, flattenCustomFields } from './customFields';

describe('isCustomFieldKey / customFieldLabel', () => {
  it('recognises the canonical colon form only', () => {
    expect(isCustomFieldKey('CustomFields:narrative.narr1')).toBe(true);
    expect(isCustomFieldKey('CustomFields:partTrnType')).toBe(true);
    expect(isCustomFieldKey('CustomFields:')).toBe(false);
    expect(isCustomFieldKey('AdditionalInformation')).toBe(false);
    expect(isCustomFieldKey('OpsAttributes:Employer')).toBe(false);
  });

  it('labels a custom field by its bare key and passes other fields through', () => {
    expect(customFieldLabel('CustomFields:narrative.narr1')).toBe('narrative.narr1');
    expect(customFieldLabel('BankReference')).toBe('BankReference');
  });
});

describe('flattenCustomFields', () => {
  it('spreads the array onto the row as prefixed scalar properties, in place', () => {
    const row = {
      Id: '1',
      AdditionalInformation: 'uniqueId: X [_TEP_] partTrnType: CREDIT',
      CustomFields: [
        { Key: 'uniqueId', Value: 'SD471576908-09-2026   2C' },
        { Key: 'partTrnType', Value: 'CREDIT' },
      ],
    } as unknown as TransactionRow;
    flattenCustomFields([row]);
    expect(row[`${CUSTOM_FIELD_PREFIX}uniqueId`]).toBe('SD471576908-09-2026   2C');
    expect(row[`${CUSTOM_FIELD_PREFIX}partTrnType`]).toBe('CREDIT');
    // The joined display text is untouched.
    expect(row['AdditionalInformation']).toBe('uniqueId: X [_TEP_] partTrnType: CREDIT');
  });

  it('leaves rows without the array untouched (other DataSetTypes, pre-backfill rows)', () => {
    const row = { Id: '2', Description1: 'plain' } as TransactionRow;
    flattenCustomFields([row]);
    expect(Object.keys(row)).toEqual(['Id', 'Description1']);
  });

  it('tolerates malformed entries and nested values', () => {
    const row = {
      Id: '3',
      CustomFields: [
        null,
        { Key: '', Value: 'skipped' },
        { Key: 'nested', Value: { a: 1 } },
        { Key: 'empty', Value: null },
      ],
    } as unknown as TransactionRow;
    flattenCustomFields([row]);
    expect(row[`${CUSTOM_FIELD_PREFIX}nested`]).toBe('{"a":1}');
    expect(row[`${CUSTOM_FIELD_PREFIX}empty`]).toBeNull();
    expect(`${CUSTOM_FIELD_PREFIX}` in row).toBe(false);
  });

  it('handles undefined/empty input', () => {
    expect(() => flattenCustomFields(undefined)).not.toThrow();
    expect(() => flattenCustomFields([])).not.toThrow();
  });
});
