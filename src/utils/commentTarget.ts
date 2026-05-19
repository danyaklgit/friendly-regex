import type { TagSpecComment, TagSpecCommentTarget } from '../types/comments';

export type CommentTargetLevel = 'library' | 'definition' | 'rule' | 'attribute';

export function getTargetLevel(target: TagSpecCommentTarget): CommentTargetLevel {
  if (target.TagRuleExpressionId) return 'rule';
  if (target.AttributeTag) return 'attribute';
  if (target.TagSpecDefinitionId) return 'definition';
  return 'library';
}

/** Stable key for use as a Map index. Library-only target = "lib:<id>". */
export function targetKey(target: TagSpecCommentTarget): string {
  const parts: string[] = [`lib:${target.TagSpecLibraryId}`];
  if (target.TagSpecDefinitionId) parts.push(`def:${target.TagSpecDefinitionId}`);
  if (target.TagRuleExpressionId) parts.push(`rule:${target.TagRuleExpressionId}`);
  if (target.AttributeTag) parts.push(`attr:${target.AttributeTag}`);
  return parts.join(':');
}

export function targetsEqual(a: TagSpecCommentTarget, b: TagSpecCommentTarget): boolean {
  return targetKey(a) === targetKey(b);
}

/** Group a flat list of comments by their target key. */
export function groupCommentsByTarget(
  comments: TagSpecComment[],
): Map<string, TagSpecComment[]> {
  const map = new Map<string, TagSpecComment[]>();
  for (const comment of comments) {
    const key = targetKey(comment.Target);
    const existing = map.get(key);
    if (existing) existing.push(comment);
    else map.set(key, [comment]);
  }
  return map;
}

/** Normalise a target so absent fields are explicitly null (what the API expects). */
export function normaliseTarget(target: TagSpecCommentTarget): TagSpecCommentTarget {
  return {
    TagSpecLibraryId: target.TagSpecLibraryId,
    TagSpecDefinitionId: target.TagSpecDefinitionId ?? null,
    TagRuleExpressionId: target.TagRuleExpressionId ?? null,
    AttributeTag: target.AttributeTag ?? null,
  };
}
