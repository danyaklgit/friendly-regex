import type { TepHeaders } from './transactions';

const BASE = '/api/tep/api/v1/TEP';

// --- Raw API types (flat response from GetTagsHierarchy) ---

export interface TagHierarchyDetail {
  Name: string;
  LanguageCode: string;
  Description: string;
}

/** Raw node as returned by the API — flat, not nested */
export interface TagHierarchyRawNode {
  Tag: string;
  Level: 'G' | 'T';
  StatusTag: string;
  Details: TagHierarchyDetail[] | null;
  /** For T nodes: array of group Tag names this leaf belongs to. For G nodes: null */
  GroupTags: string[] | null;
  /** For T nodes: another Tag name (string) as parent reference, or null. For G nodes: null */
  ParentTag: string | null;
}

// --- Built tree types ---

/** A node in the client-built tree (groups with leaf children) */
export interface TagTreeNode {
  tag: string;
  level: 'G' | 'T';
  name: string;
  description: string;
  statusTag: string;
  children: TagTreeNode[];
}

/** Build a nested tree from the flat API response */
export function buildTagTree(rawNodes: TagHierarchyRawNode[]): TagTreeNode[] {
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) return [];

  const groups: TagHierarchyRawNode[] = [];
  const leaves: TagHierarchyRawNode[] = [];

  for (const node of rawNodes) {
    if (!node || !node.Tag) continue;
    if (node.Level === 'G') groups.push(node);
    else if (node.Level === 'T') leaves.push(node);
  }

  // Map group Tag → TagTreeNode
  const groupMap = new Map<string, TagTreeNode>();
  for (const g of groups) {
    const detail = g.Details?.find((d) => d.LanguageCode === 'en');
    groupMap.set(g.Tag, {
      tag: g.Tag,
      level: 'G',
      name: detail?.Name ?? g.Tag,
      description: detail?.Description ?? '',
      statusTag: g.StatusTag,
      children: [],
    });
  }

  // Place each leaf under ALL groups listed in its GroupTags
  // The same tag can appear under multiple groups
  for (const leaf of leaves) {
    const detail = leaf.Details?.find((d) => d.LanguageCode === 'en');

    for (const groupTag of leaf.GroupTags ?? []) {
      const group = groupMap.get(groupTag);
      if (!group) continue;
      group.children.push({
        tag: leaf.Tag,
        level: 'T',
        name: detail?.Name ?? leaf.Tag,
        description: detail?.Description ?? '',
        statusTag: leaf.StatusTag,
        children: [],
      });
    }
  }

  // Return only groups that have at least one child, sorted alphabetically
  return Array.from(groupMap.values())
    .filter((g) => g.children.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- API client ---

export async function getTagsHierarchy(
  authToken: string,
  tepHeaders: TepHeaders,
  signal?: AbortSignal,
): Promise<TagTreeNode[]> {
  const res = await fetch(`${BASE}/GetTagsHierarchy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-apikey': tepHeaders.apiKey,
      ActivityTag: 'GetTagsHierarchy',
      LanguageCode: 'en',
      TTPUserId: tepHeaders.userId,
      TTPTenantCode: tepHeaders.tenantCode,
      TTPRequestId: tepHeaders.requestId,
      TimeZone: tepHeaders.timeZone,
    },
    body: JSON.stringify({ DataSetType: 'MT940' }),
    signal,
  });

  if (!res.ok) throw new Error('Failed to fetch tags hierarchy');
  const json = await res.json();
  const wrapper = json.TagsHierarchy;
  // Response shape: { TagsHierarchy: { Id, DataSetType, ..., TagsHierarchy: [...flat nodes] } }
  const rawNodes: TagHierarchyRawNode[] = Array.isArray(wrapper) ? wrapper : wrapper?.TagsHierarchy ?? [];
  return buildTagTree(rawNodes);
}
