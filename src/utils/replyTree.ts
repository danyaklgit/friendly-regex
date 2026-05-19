import type { TagSpecCommentReply } from '../types/comments';

export interface ReplyTreeNode {
  reply: TagSpecCommentReply;
  children: ReplyTreeNode[];
}

/**
 * Server may return replies nested (each reply carrying its own Replies array)
 * OR flat with ParentReplyId pointers. This walks any nested shape and emits a
 * single flat list while preserving the ParentReplyId hint on each reply when
 * we can infer it from the nesting position.
 */
export function flattenReplies(replies: TagSpecCommentReply[] | undefined): TagSpecCommentReply[] {
  if (!replies?.length) return [];
  const out: TagSpecCommentReply[] = [];
  const walk = (list: TagSpecCommentReply[], parentId: string | null) => {
    for (const r of list) {
      const flat: TagSpecCommentReply = { ...r, ParentReplyId: r.ParentReplyId ?? parentId };
      delete (flat as { Replies?: TagSpecCommentReply[] }).Replies;
      out.push(flat);
      if (r.Replies?.length) walk(r.Replies, r.Id ?? parentId);
    }
  };
  walk(replies, null);
  return out;
}

/**
 * Build a one-level-deep tree from a flat reply list. Replies pointing at a
 * non-existent parent are surfaced as root. Replies pointing at a child reply
 * (would-be grandchild) are flattened up to be siblings under the same root,
 * so the UI never indents past two levels.
 */
export function buildReplyTree(replies: TagSpecCommentReply[]): ReplyTreeNode[] {
  const byId = new Map<string, TagSpecCommentReply>();
  for (const r of replies) if (r.Id) byId.set(r.Id, r);

  const rootIds = new Set<string>();
  for (const r of replies) {
    if (!r.ParentReplyId || !byId.has(r.ParentReplyId)) {
      if (r.Id) rootIds.add(r.Id);
    }
  }

  /** Walk up the ParentReplyId chain until we hit a root reply (or run out). */
  const findRootId = (r: TagSpecCommentReply): string | null => {
    let current: TagSpecCommentReply | undefined = r;
    const seen = new Set<string>();
    while (current) {
      if (!current.Id) return null;
      if (rootIds.has(current.Id)) return current.Id;
      if (seen.has(current.Id)) return null;
      seen.add(current.Id);
      if (!current.ParentReplyId) return current.Id;
      current = byId.get(current.ParentReplyId);
    }
    return null;
  };

  const compareDate = (a: TagSpecCommentReply, b: TagSpecCommentReply) =>
    (a.CreationDate ?? '').localeCompare(b.CreationDate ?? '');

  const rootReplies = replies.filter((r) => r.Id && rootIds.has(r.Id)).sort(compareDate);
  const childrenByRoot = new Map<string, TagSpecCommentReply[]>();

  for (const r of replies) {
    if (!r.Id || rootIds.has(r.Id)) continue;
    const rootId = findRootId(r);
    if (!rootId) continue;
    const list = childrenByRoot.get(rootId) ?? [];
    list.push(r);
    childrenByRoot.set(rootId, list);
  }

  return rootReplies.map((r) => ({
    reply: r,
    children: (childrenByRoot.get(r.Id!) ?? [])
      .sort(compareDate)
      .map((child) => ({ reply: child, children: [] as ReplyTreeNode[] })),
  }));
}

/** Total replies across the entire tree (root + all descendants). */
export function countTreeReplies(tree: ReplyTreeNode[]): number {
  return tree.reduce((sum, node) => sum + 1 + countTreeReplies(node.children), 0);
}
