import type { TagSpecLibrary } from '../types';

export interface TagNameOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface AttributeSuggestion {
  name: string;
  count: number;
}

/**
 * Distinct tag names across every library. Case-insensitive deduplication keeps
 * the first-encountered casing as the canonical display.
 */
export function getAllTagNameOptions(libraries: TagSpecLibrary[]): TagNameOption[] {
  const counts = new Map<string, { canonical: string; count: number }>();
  for (const lib of libraries) {
    for (const def of lib.TagSpecDefinitions ?? []) {
      const key = def.Tag.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { canonical: def.Tag, count: 1 });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => a.canonical.localeCompare(b.canonical))
    .map(({ canonical, count }) => ({
      value: canonical,
      label: canonical,
      sublabel: `${count} definition${count === 1 ? '' : 's'}`,
    }));
}

/**
 * Distinct attribute names paired with the given tag name (case-insensitive
 * match on Tag) across every library, excluding names already present in
 * `currentAttributeNames`. Returned in descending frequency, then alphabetical.
 */
export function getAttributeSuggestionsForTag(
  libraries: TagSpecLibrary[],
  tagName: string,
  currentAttributeNames: string[],
): AttributeSuggestion[] {
  const target = tagName.trim().toLowerCase();
  if (!target) return [];
  const exclude = new Set(currentAttributeNames.map((n) => n.trim().toLowerCase()).filter(Boolean));

  const counts = new Map<string, { canonical: string; count: number }>();
  for (const lib of libraries) {
    for (const def of lib.TagSpecDefinitions ?? []) {
      if (def.Tag.toLowerCase() !== target) continue;
      for (const attr of def.Attributes ?? []) {
        const name = attr.AttributeTag;
        if (!name) continue;
        const key = name.toLowerCase();
        if (exclude.has(key)) continue;
        const existing = counts.get(key);
        if (existing) existing.count += 1;
        else counts.set(key, { canonical: name, count: 1 });
      }
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical))
    .map(({ canonical, count }) => ({ name: canonical, count }));
}
