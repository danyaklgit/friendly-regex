import { describe, it, expect } from 'vitest';
import { getContextValue, contextMatchesRow, getRegexDescription } from './tagSpec';
import type { TransactionRow } from './transaction';

describe('getContextValue', () => {
  const context = [
    { Key: 'Side', Value: 'CR' },
    { Key: 'BankSwiftCode', Value: 'NCBKSAJE' },
  ];

  it('returns value for existing key', () => {
    expect(getContextValue(context, 'Side')).toBe('CR');
  });

  it('returns undefined for missing key', () => {
    expect(getContextValue(context, 'Missing')).toBeUndefined();
  });

  it('handles empty context', () => {
    expect(getContextValue([], 'Side')).toBeUndefined();
  });
});

describe('contextMatchesRow', () => {
  const row: TransactionRow = {
    Side: 'CR',
    BankSwiftCode: 'NCBKSAJE',
    Amount: '100',
  };

  it('matches when all context entries match', () => {
    const context = [
      { Key: 'Side', Value: 'CR' },
      { Key: 'BankSwiftCode', Value: 'NCBKSAJE' },
    ];
    expect(contextMatchesRow(context, row)).toBe(true);
  });

  it('fails when one entry does not match', () => {
    const context = [
      { Key: 'Side', Value: 'DR' },
    ];
    expect(contextMatchesRow(context, row)).toBe(false);
  });

  it('empty context matches any row', () => {
    expect(contextMatchesRow([], row)).toBe(true);
  });

  it('missing field in row treated as empty string', () => {
    const context = [{ Key: 'NonExistent', Value: '' }];
    expect(contextMatchesRow(context, row)).toBe(true);
  });

  it('missing field does not match non-empty value', () => {
    const context = [{ Key: 'NonExistent', Value: 'X' }];
    expect(contextMatchesRow(context, row)).toBe(false);
  });
});

describe('getRegexDescription', () => {
  it('returns english description', () => {
    const details = [
      { LanguageCode: 'en', Description: 'Starts with TNXT' },
      { LanguageCode: 'ar', Description: 'يبدأ بـ TNXT' },
    ];
    expect(getRegexDescription(details)).toBe('Starts with TNXT');
  });

  it('returns empty string when no english description', () => {
    const details = [{ LanguageCode: 'ar', Description: 'يبدأ بـ TNXT' }];
    expect(getRegexDescription(details)).toBe('');
  });

  it('returns empty string for empty array', () => {
    expect(getRegexDescription([])).toBe('');
  });

  it('returns empty string for undefined/null', () => {
    expect(getRegexDescription(undefined as any)).toBe('');
  });
});
