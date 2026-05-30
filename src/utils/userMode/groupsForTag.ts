import type { TagTreeNode } from '../../api/tagsHierarchy';

/**
 * Group display names that are always hidden in the user portal. "Inflows" and
 * "Outflows" only restate the debit/credit side of a transaction and add no
 * information, so they're suppressed everywhere group names surface (the
 * Group(s) column and the GROUP_TAGS filter). Matched case-insensitively.
 */
export const HIDDEN_GROUP_NAMES = new Set(['inflows', 'outflows']);

/** True when a group's display name (or code) is on the always-hidden list. */
export function isHiddenGroupName(name: string): boolean {
  return HIDDEN_GROUP_NAMES.has(name.trim().toLowerCase());
}

/**
 * Given a built tag hierarchy and a leaf tag identifier, return the **display
 * names** of every group that contains that tag, distinct and sorted
 * alphabetically. A tag can appear under multiple groups; we report all of
 * them. The always-hidden groups (see {@link HIDDEN_GROUP_NAMES}) are dropped.
 *
 * Returns an empty array when the tag isn't present anywhere in the tree.
 */
export function groupsForTag(tree: TagTreeNode[], tag: string): string[] {
  if (!tag) return [];
  const seen = new Set<string>();
  for (const node of tree) {
    if (node.level !== 'G') continue;
    if (isHiddenGroupName(node.name)) continue;
    if (node.children.some((c) => c.tag === tag)) {
      seen.add(node.name);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}
