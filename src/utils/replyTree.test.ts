import { describe, it, expect } from 'vitest';
import type { TagSpecCommentReply } from '../types/comments';
import { buildReplyTree, countTreeReplies, flattenReplies } from './replyTree';

function reply(id: string, parent: string | null = null, date = '2026-05-19T10:00:00Z'): TagSpecCommentReply {
  return {
    Id: id,
    UserId: `u-${id}`,
    Status: 'ACKNOWLEDGED',
    Comment: `body-${id}`,
    CreationDate: date,
    ParentReplyId: parent,
  };
}

describe('flattenReplies', () => {
  it('returns [] for missing/empty input', () => {
    expect(flattenReplies(undefined)).toEqual([]);
    expect(flattenReplies([])).toEqual([]);
  });

  it('walks nested Replies fields and infers ParentReplyId when absent', () => {
    const nested: TagSpecCommentReply[] = [
      { ...reply('a'), Replies: [reply('b'), { ...reply('c'), Replies: [reply('d')] }] },
    ];
    const flat = flattenReplies(nested);
    expect(flat.map((r) => r.Id)).toEqual(['a', 'b', 'c', 'd']);
    expect(flat.find((r) => r.Id === 'b')?.ParentReplyId).toBe('a');
    expect(flat.find((r) => r.Id === 'd')?.ParentReplyId).toBe('c');
    expect(flat.every((r) => r.Replies === undefined)).toBe(true);
  });

  it('preserves an explicit ParentReplyId even when nested', () => {
    const nested: TagSpecCommentReply[] = [
      { ...reply('a'), Replies: [{ ...reply('b', 'explicit-root') }] },
    ];
    expect(flattenReplies(nested).find((r) => r.Id === 'b')?.ParentReplyId).toBe('explicit-root');
  });
});

describe('buildReplyTree', () => {
  it('treats replies without a parent as root, sorted by date', () => {
    const tree = buildReplyTree([
      reply('a', null, '2026-05-19T12:00:00Z'),
      reply('b', null, '2026-05-19T10:00:00Z'),
    ]);
    expect(tree.map((n) => n.reply.Id)).toEqual(['b', 'a']);
  });

  it('nests a reply under its parent', () => {
    const tree = buildReplyTree([reply('a'), reply('b', 'a')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].reply.Id).toBe('a');
    expect(tree[0].children.map((c) => c.reply.Id)).toEqual(['b']);
  });

  it('flattens grandchildren up to the root (max 2 visual levels)', () => {
    const tree = buildReplyTree([reply('a'), reply('b', 'a'), reply('c', 'b')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.reply.Id).sort()).toEqual(['b', 'c']);
  });

  it('treats replies with a non-existent parent as root', () => {
    const tree = buildReplyTree([reply('orphan', 'missing-id')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].reply.Id).toBe('orphan');
  });
});

describe('countTreeReplies', () => {
  it('sums root replies and their children', () => {
    const tree = buildReplyTree([reply('a'), reply('b', 'a'), reply('c')]);
    expect(countTreeReplies(tree)).toBe(3);
  });
});
