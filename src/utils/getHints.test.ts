import { describe, it, expect } from 'vitest';
import { getHints } from './getHints';
import type { TransactionRow } from '../types';

function row(hints: unknown): TransactionRow {
  return { Hints: hints } as unknown as TransactionRow;
}

describe('getHints', () => {
  it('returns the array as-is when Hints is a string[]', () => {
    expect(getHints(row(['Instant Transfers', 'Incoming Transfer']))).toEqual([
      'Instant Transfers',
      'Incoming Transfer',
    ]);
  });

  it('returns an empty array when Hints is missing', () => {
    expect(getHints({} as TransactionRow)).toEqual([]);
  });

  it('returns an empty array when Hints is null', () => {
    expect(getHints(row(null))).toEqual([]);
  });

  it('returns an empty array when Hints is not an array', () => {
    expect(getHints(row('a single string'))).toEqual([]);
    expect(getHints(row(42))).toEqual([]);
    expect(getHints(row({ foo: 'bar' }))).toEqual([]);
  });

  it('filters out non-string entries', () => {
    expect(getHints(row(['ok', 1, null, undefined, { x: 1 }, 'also-ok']))).toEqual([
      'ok',
      'also-ok',
    ]);
  });

  it('filters out empty strings', () => {
    expect(getHints(row(['', 'kept', '']))).toEqual(['kept']);
  });

  it('preserves order', () => {
    expect(getHints(row(['c', 'a', 'b']))).toEqual(['c', 'a', 'b']);
  });
});
