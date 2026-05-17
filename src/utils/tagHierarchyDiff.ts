import type { TagHierarchyRawNode } from '../api/tagsHierarchy';
import { getNodeName, getNodeDesc } from './tagHierarchyNode';

export interface NodeDiff {
  tag: string;
  name: string;
  changes: string[];
}

export interface HierarchyDiff {
  added: TagHierarchyRawNode[];
  removed: TagHierarchyRawNode[];
  modified: NodeDiff[];
}

function arraysEqual(a: string[] | null, b: string[] | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export function computeDiff(
  current: TagHierarchyRawNode[],
  original: TagHierarchyRawNode[],
): HierarchyDiff {
  const originalMap = new Map(original.map((n) => [n.Tag, n]));
  const currentMap = new Map(current.map((n) => [n.Tag, n]));

  const added = current.filter((n) => !originalMap.has(n.Tag));
  const removed = original.filter((n) => !currentMap.has(n.Tag));

  const modified: NodeDiff[] = [];
  for (const node of current) {
    const orig = originalMap.get(node.Tag);
    if (!orig) continue;

    const changes: string[] = [];
    if (node.StatusTag !== orig.StatusTag) {
      changes.push(`Status: ${orig.StatusTag} → ${node.StatusTag}`);
    }

    const origName = getNodeName(orig);
    const curName = getNodeName(node);
    if (curName !== origName) changes.push(`Name: "${origName}" → "${curName}"`);

    const origDesc = getNodeDesc(orig);
    const curDesc = getNodeDesc(node);
    if (curDesc !== origDesc) changes.push('Description changed');

    if (!arraysEqual(node.GroupTags, orig.GroupTags)) {
      changes.push(`Groups: [${(orig.GroupTags ?? []).join(', ')}] → [${(node.GroupTags ?? []).join(', ')}]`);
    }

    if (node.ParentTag !== orig.ParentTag) {
      changes.push(`Parent: ${orig.ParentTag ?? 'none'} → ${node.ParentTag ?? 'none'}`);
    }

    if (changes.length > 0) {
      modified.push({ tag: node.Tag, name: curName, changes });
    }
  }

  return { added, removed, modified };
}
