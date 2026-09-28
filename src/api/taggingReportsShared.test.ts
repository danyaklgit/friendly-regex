import { describe, it, expect } from 'vitest';
import {
  isGranularity, isLayer, numberOrZero, stringOrEmpty, asRecord, summaryPair, tepReportHeaders, TEP_BASE,
} from './taggingReportsShared';

describe('taggingReportsShared', () => {
  it.each([
    ['Day', true], ['Week', true], ['Month', true], ['Year', true],
    ['day', false], ['', false], [null, false], [3, false],
  ])('isGranularity(%j) is %s', (value, expected) => {
    expect(isGranularity(value)).toBe(expected);
  });

  it.each([['Ops', true], ['Active', true], ['ops', false], [undefined, false]])('isLayer(%j) is %s', (value, expected) => {
    expect(isLayer(value)).toBe(expected);
  });

  it.each([
    [74, 74], ['97.30', 97.3], [' 12 ', 12], ['', 0], [null, 0], [undefined, 0], ['abc', 0], [true, 0], [Infinity, 0], [NaN, 0],
  ])('numberOrZero(%j) is %s', (value, expected) => {
    expect(numberOrZero(value)).toBe(expected);
  });

  it('stringOrEmpty keeps strings and blanks everything else', () => {
    expect(stringOrEmpty('x')).toBe('x');
    expect(stringOrEmpty(5)).toBe('');
    expect(stringOrEmpty(null)).toBe('');
  });

  it('asRecord returns an empty object for non-objects', () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord('s')).toEqual({});
    expect(asRecord([1])).toEqual({});
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it('summaryPair derives the missing half from the present one', () => {
    expect(summaryPair(['a', '', 'b'], undefined)).toEqual({ SummaryLines: ['a', '', 'b'], SummaryText: 'a\n\nb' });
    expect(summaryPair(undefined, 'a\n\nb')).toEqual({ SummaryLines: ['a', '', 'b'], SummaryText: 'a\n\nb' });
    expect(summaryPair(undefined, undefined)).toEqual({ SummaryLines: [], SummaryText: '' });
    expect(summaryPair(['a', 7, 'b'], 'kept')).toEqual({ SummaryLines: ['a', 'b'], SummaryText: 'kept' });
  });

  it('tepReportHeaders builds the standard TEP bundle', () => {
    const headers = tepReportHeaders('GetTaggingProgress', 'tok', {
      userId: 'u', tenantCode: 't', languageCode: 'en', timeZone: 'UTC', requestId: 'r',
    });
    expect(headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Bearer tok',
      ActivityTag: 'GetTaggingProgress',
      LanguageCode: 'en',
      TTPUserId: 'u',
      TTPTenantCode: 't',
      TTPRequestId: 'r',
      TimeZone: 'UTC',
    });
    expect(TEP_BASE).toBe('/api/tep/api/v1/TEP');
  });
});
