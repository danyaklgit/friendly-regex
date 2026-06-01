import type { TagTreeNode } from '../../api/tagsHierarchy';

/**
 * Build a `tagCode → display name` map from the built tag hierarchy. A leaf
 * node carries both `.tag` (the code, e.g. "TransferOut") and `.name` (the
 * localized display name, e.g. "Outbound Transfer"). The user portal shows the
 * display name; this mirrors the lookup TagTreePicker builds for its selected
 * indicator.
 *
 * The same tag can appear under multiple groups — first occurrence wins (they
 * carry the same name).
 */
export function buildTagDisplayNameMap(tree: TagTreeNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of tree) {
    for (const leaf of group.children) {
      if (!map.has(leaf.tag)) map.set(leaf.tag, leaf.name);
    }
  }
  return map;
}

/** Resolve a tag code to its display name, falling back to the code itself. */
export function tagDisplayName(map: Map<string, string>, code: string | null | undefined): string {
  if (!code) return '';
  return map.get(code) ?? code;
}
