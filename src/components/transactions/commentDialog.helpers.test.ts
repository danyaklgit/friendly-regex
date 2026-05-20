import { describe, it, expect } from 'vitest';
import {
  splitRows,
  hasComment,
  getRowId,
  getRowComment,
  distinctComments,
  buildApplyAllPayload,
  buildReviewPayload,
} from './commentDialog.helpers';
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

describe('getRowComment', () => {
  it('returns the comment string, or empty when missing/null', () => {
    expect(getRowComment(r('a', 'note'))).toBe('note');
    expect(getRowComment(r('a'))).toBe('');
    expect(getRowComment(r('a', null))).toBe('');
  });
});

describe('splitRows', () => {
  it('mixed → rowsWithoutComment and rowsWithComment', () => {
    const result = splitRows([r('a'), r('b', 'x'), r('c'), r('d', 'y')]);
    expect(result.rowsWithoutComment.map(getRowId)).toEqual(['a', 'c']);
    expect(result.rowsWithComment.map(getRowId)).toEqual(['b', 'd']);
  });
});

describe('distinctComments', () => {
  it('dedupes by trimmed comment with counts, in first-appearance order', () => {
    const result = distinctComments([
      r('a', 'Refund processed'),
      r('b', 'Pending review'),
      r('c', '  Refund processed  '),
      r('d'),
    ]);
    expect(result).toEqual([
      { comment: 'Refund processed', count: 2 },
      { comment: 'Pending review', count: 1 },
    ]);
  });

  it('ignores rows without a comment', () => {
    expect(distinctComments([r('a'), r('b', '')])).toEqual([]);
  });
});

describe('buildApplyAllPayload', () => {
  it('writes the same trimmed comment to every row', () => {
    const payload = buildApplyAllPayload([r('a'), r('b', 'old'), r('c')], '  done  ');
    expect(payload).toEqual([
      { Id: 'a', Comment: 'done' },
      { Id: 'b', Comment: 'done' },
      { Id: 'c', Comment: 'done' },
    ]);
  });
});

describe('buildReviewPayload', () => {
  it('applies the bulk comment to the comment-less rows', () => {
    const payload = buildReviewPayload({
      rowsWithoutComment: [r('a'), r('b')],
      bulkComment: '  hi ',
      perRow: new Map(),
    });
    expect(payload).toEqual([
      { Id: 'a', Comment: 'hi' },
      { Id: 'b', Comment: 'hi' },
    ]);
  });

  it('skips the bulk comment when empty', () => {
    const payload = buildReviewPayload({
      rowsWithoutComment: [r('a')],
      bulkComment: '   ',
      perRow: new Map(),
    });
    expect(payload).toEqual([]);
  });

  it('replaces a per-row comment with the edited text', () => {
    const payload = buildReviewPayload({
      rowsWithoutComment: [],
      bulkComment: '',
      perRow: new Map([['x', 'replacement']]),
    });
    expect(payload).toEqual([{ Id: 'x', Comment: 'replacement' }]);
  });

  it('emits a null Comment when a per-row entry is cleared', () => {
    const payload = buildReviewPayload({
      rowsWithoutComment: [],
      bulkComment: '',
      perRow: new Map([['x', null]]),
    });
    expect(payload).toEqual([{ Id: 'x', Comment: null }]);
  });

  it('omits per-row entries that are absent (kept) or empty-after-trim', () => {
    const payload = buildReviewPayload({
      rowsWithoutComment: [],
      bulkComment: '',
      perRow: new Map([['x', '   ']]),
    });
    expect(payload).toEqual([]);
  });

  it('combines bulk, replace, and clear entries', () => {
    const payload = buildReviewPayload({
      rowsWithoutComment: [r('a')],
      bulkComment: 'bulk',
      perRow: new Map<string, string | null>([['b', 'edited'], ['c', null]]),
    });
    expect(payload).toEqual([
      { Id: 'a', Comment: 'bulk' },
      { Id: 'b', Comment: 'edited' },
      { Id: 'c', Comment: null },
    ]);
  });
});
