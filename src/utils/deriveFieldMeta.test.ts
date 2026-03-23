import { describe, it, expect } from 'vitest';
import { deriveFieldMeta } from './deriveFieldMeta';

describe('deriveFieldMeta', () => {
  it('identifies _id as identifier field', () => {
    const rows = [{ _id: '1', BankSwiftCode: 'NCBK', Amount: '100' }];
    const meta = deriveFieldMeta(rows);
    expect(meta.identifierField).toBe('_id');
  });

  it('falls back to Identifier when _id is absent', () => {
    const rows = [{ Identifier: '1', Amount: '100' }];
    const meta = deriveFieldMeta(rows);
    expect(meta.identifierField).toBe('Identifier');
  });

  it('falls back to Name when _id and Identifier are absent', () => {
    const rows = [{ Name: 'Test', Amount: '100' }];
    const meta = deriveFieldMeta(rows);
    expect(meta.identifierField).toBe('Name');
  });

  it('defaults to _id when none of the candidates exist', () => {
    const rows = [{ Amount: '100', Side: 'CR' }];
    const meta = deriveFieldMeta(rows);
    expect(meta.identifierField).toBe('_id');
  });

  it('excludes SKIP_FIELDS from dataFields', () => {
    const rows = [{ _id: '1', Hash: 'abc', Tag: 'X', Amount: '100' }];
    const meta = deriveFieldMeta(rows);
    expect(meta.dataFields).not.toContain('Hash');
    expect(meta.dataFields).not.toContain('Tag');
    expect(meta.dataFields).toContain('Amount');
  });

  it('excludes identifier from dataFields', () => {
    const rows = [{ _id: '1', Amount: '100' }];
    const meta = deriveFieldMeta(rows);
    expect(meta.dataFields).not.toContain('_id');
  });

  it('excludes object-valued fields', () => {
    const rows = [{ _id: '1', Amount: '100', Nested: { foo: 'bar' } as any }];
    const meta = deriveFieldMeta(rows);
    expect(meta.dataFields).not.toContain('Nested');
  });

  it('puts priority fields first in order', () => {
    const rows = [{
      _id: '1',
      Zebra: 'z',
      Amount: '100',
      BankSwiftCode: 'NCBK',
      IBAN: 'SA123',
      Side: 'CR',
    }];
    const meta = deriveFieldMeta(rows);
    expect(meta.dataFields[0]).toBe('BankSwiftCode');
    expect(meta.dataFields[1]).toBe('IBAN');
    expect(meta.dataFields[2]).toBe('Side');
    expect(meta.dataFields[3]).toBe('Amount');
  });

  it('sourceFields equals dataFields', () => {
    const rows = [{ _id: '1', Amount: '100', Side: 'CR' }];
    const meta = deriveFieldMeta(rows);
    expect(meta.sourceFields).toEqual(meta.dataFields);
  });

  it('handles empty rows array', () => {
    const meta = deriveFieldMeta([]);
    expect(meta.identifierField).toBe('_id');
    expect(meta.dataFields).toEqual([]);
  });
});
