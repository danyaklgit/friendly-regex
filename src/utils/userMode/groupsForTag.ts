import type { TagTreeNode } from '../../api/tagsHierarchy';

/**
 * Given a built tag hierarchy and a leaf tag identifier, return the **display
 * names** of every group that contains that tag, distinct and sorted
 * alphabetically. A tag can appear under multiple groups; we report all of
 * them.
 *
 * Returns an empty array when the tag isn't present anywhere in the tree.
 */
export function groupsForTag(tree: TagTreeNode[], tag: string): string[] {
  if (!tag) return [];
  const seen = new Set<string>();
  for (const node of tree) {
    if (node.level !== 'G') continue;
    if (node.children.some((c) => c.tag === tag)) {
      seen.add(node.name);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}
