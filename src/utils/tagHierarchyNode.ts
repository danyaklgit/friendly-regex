import type { TagHierarchyRawNode } from '../api/tagsHierarchy';

export function getNodeName(node: TagHierarchyRawNode): string {
  return node.Details?.find((d) => d.LanguageCode === 'en')?.Name ?? node.Tag;
}

export function getNodeDesc(node: TagHierarchyRawNode): string {
  return node.Details?.find((d) => d.LanguageCode === 'en')?.Description ?? '';
}
