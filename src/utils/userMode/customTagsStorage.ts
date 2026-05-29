/**
 * Device-wide custom-tag storage for the user-mode portal.
 *
 * Custom tags are tags the user created from the tag picker's "Create new tag"
 * affordance. They live in a single device-scoped localStorage key — by user
 * decision — so multiple users on the same browser can see and reuse each
 * other's creations. Contributions are still per-user (see
 * `contributionStorage.ts`); the divide is intentional.
 *
 * A custom tag can belong to multiple groups (mirroring the server-side
 * `GroupTags: string[]` on a leaf node), so the picker tree can surface it
 * under each chosen group.
 *
 * Storage shape:
 *   localStorage['tep:userCustomTags'] = JSON.stringify(CustomTag[])
 *
 * The loader transparently migrates legacy single-group records
 *   { name, group: 'X', createdAt } -> { name, groups: ['X'], createdAt }
 * so devices that already had custom tags from the single-group era keep them.
 */

export interface CustomTag {
  /** User-provided display name; also used as the synthesized leaf tag identifier. */
  name: string;
  /** Group tags (from the hierarchy, level='G') this tag belongs to. */
  groups: string[];
  /** ISO timestamp. */
  createdAt: string;
}

/** Legacy record shape, kept here purely for type-safe migration in load. */
interface LegacyCustomTag {
  name: string;
  group: string;
  createdAt: string;
}

const STORAGE_KEY = 'tep:userCustomTags';

function isLegacy(value: unknown): value is LegacyCustomTag {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.name === 'string' && typeof v.group === 'string' && !Array.isArray(v.groups);
}

function isCurrent(value: unknown): value is CustomTag {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.name === 'string' && Array.isArray(v.groups);
}

export function loadCustomTags(): CustomTag[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: CustomTag[] = [];
    for (const entry of parsed) {
      if (isCurrent(entry)) {
        out.push({ name: entry.name, groups: entry.groups.filter((g) => typeof g === 'string'), createdAt: String(entry.createdAt ?? '') });
      } else if (isLegacy(entry)) {
        out.push({ name: entry.name, groups: [entry.group], createdAt: String(entry.createdAt ?? '') });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustomTags(tags: CustomTag[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
  } catch {
    console.warn('[customTagsStorage] localStorage write failed');
  }
}
