import { describe, it, expect } from 'vitest';
import { splitRows, buildPayload, hasComment, getRowId } from './commentDialog.helpers';
import type { TransactionRow } from '../../types';

function r(id: string, comment?: string | null): TransactionRow {
  const row: Record<string, unknown> = { Id: id };
  if (comment !== undefined) row.Comment = comment;
  return row as TransactionRow;
}

describe('hasComment', () => {
  it('returns false for missing, null, empty, and whitespace', () => {
    expect(hasComment(r('a'))).toBe(false);
    expect(hasComment(r('a', null))).toBe(false);
    expect(hasComment(r('a', ''))).toBe(false);
    expect(hasComment(r('a', '   '))).toBe(false);
  });

  it('returns true for non-empty string', () => {
    expect(hasComment(r('a', 'note'))).toBe(true);
    expect(hasComment(r('a', '  note  '))).toBe(true);
  });
});

describe('getRowId', () => {
  it('returns Id as string', () => {
    expect(getRowId(r('abc'))).toBe('abc');
  });

  it('returns empty string when Id is missing', () => {
    expect(getRowId({} as TransactionRow)).toBe('');
  });
});

describe('splitRows', () => {
  it('all rows without comments → 1 bulk step, no override steps', () => {
    const result = splitRows([r('a'), r('b'), r('c')]);
    expect(result.rowsWithoutComment).toHaveLength(3);
    expect(result.rowsWithComment).toHaveLength(0);
    expect(result.hasBulkStep).toBe(true);
    expect(result.totalSteps).toBe(1);
  });

  it('all rows with comments → no bulk step, N override steps', () => {
    const result = splitRows([r('a', 'x'), r('b', 'y')]);
    expect(result.rowsWithoutComment).toHaveLength(0);
    expect(result.rowsWithComment).toHaveLength(2);
    expect(result.hasBulkStep).toBe(false);
    expect(result.totalSteps).toBe(2);
  });

  it('mixed → 1 bulk step + per-conflict override steps', () => {
    const result = splitRows([r('a'), r('b', 'x'), r('c'), r('d', 'y')]);
    expect(result.rowsWithoutComment).toHaveLength(2);
    expect(result.rowsWithComment).toHaveLength(2);
    expect(result.hasBulkStep).toBe(true);
    expect(result.totalSteps).toBe(3);
  });

  it('empty input → no steps', () => {
    const result = splitRows([]);
    expect(result.hasBulkStep).toBe(false);
    expect(result.totalSteps).toBe(0);
  });
});

describe('buildPayload', () => {
  it('includes all rows without comments when bulkComment is set', () => {
    const payload = buildPayload({
      rowsWithoutComment: [r('a'), r('b')],
      bulkComment: 'hello',
      perRowComments: new Map(),
    });
    expect(payload).toEqual([
      { Id: 'a', Comment: 'hello' },
      { Id: 'b', Comment: 'hello' },
    ]);
  });

  it('skips bulk entries when bulkComment is empty/whitespace', () => {
    const payload = buildPayload({
      rowsWithoutComment: [r('a'), r('b')],
      bulkComment: '   ',
      perRowComments: new Map(),
    });
    expect(payload).toEqual([]);
  });

  it('trims bulkComment before using it', () => {
    const payload = buildPayload({
      rowsWithoutComment: [r('a')],
      bulkComment: '  hi  ',
      perRowComments: new Map(),
    });
    expect(payload).toEqual([{ Id: 'a', Comment: 'hi' }]);
  });

  it('includes only overwritten per-row entries (Keep is absent)', () => {
    const payload = buildPayload({
      rowsWithoutComment: [],
      bulkComment: '',
      perRowComments: new Map([['x', 'override']]),
    });
    expect(payload).toEqual([{ Id: 'x', Comment: 'override' }]);
  });

  it('combines bulk and per-row entries', () => {
    const payload = buildPayload({
      rowsWithoutComment: [r('a'), r('b')],
      bulkComment: 'bulk',
      perRowComments: new Map([['c', 'specific']]),
    });
    expect(payload).toEqual([
      { Id: 'a', Comment: 'bulk' },
      { Id: 'b', Comment: 'bulk' },
      { Id: 'c', Comment: 'specific' },
    ]);
  });

  it('returns empty payload when nothing changed', () => {
    const payload = buildPayload({
      rowsWithoutComment: [r('a'), r('b')],
      bulkComment: '',
      perRowComments: new Map(),
    });
    expect(payload).toEqual([]);
  });

  it('skips per-row entries with empty/whitespace comments', () => {
    const payload = buildPayload({
      rowsWithoutComment: [],
      bulkComment: '',
      perRowComments: new Map([['x', '  ']]),
    });
    expect(payload).toEqual([]);
  });
});
