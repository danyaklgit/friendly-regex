import type { TagSpecDefinition, TagSpecLibrary } from '../types';
import type { DefinitionVersionInfo } from './definitionVersions';

export interface MatchingTagEntry {
  id: string;
  def?: TagSpecDefinition;
  version?: number;
}

/**
 * Resolve the definition ids stamped on transactions (`GetAllTransactionTags`)
 * to display entries for the Detected Tag Specs dropdown.
 *
 * Names are looked up in EVERY library copy the context holds, not only the
 * editing view. `libraries` is the server list as fetched (for a checked-out
 * pair that is BOTH the ACTIVE copy and the INPROGRESS draft, the latter
 * overlaid with this browser's draft cache). `editingLibraries` is the view
 * built for rule analysis: ACTIVE copy dropped, temp preview folded in. The
 * editing view wins where it holds the id, so a local rename shows its new
 * name; an id the draft cache lacks still resolves through the server copy.
 * Only an id absent from every copy stays unresolved, which the dropdown
 * renders as "(unknown)". Sorted by tag name, case-insensitive; unresolved
 * entries sink to the bottom.
 */
export function resolveMatchingTagEntries(
  ids: readonly string[],
  libraries: readonly TagSpecLibrary[],
  editingLibraries: readonly TagSpecLibrary[],
  versions: ReadonlyMap<string, DefinitionVersionInfo>,
): MatchingTagEntry[] {
  if (ids.length === 0) return [];
  const byId = new Map<string, TagSpecDefinition>();
  for (const lib of libraries) {
    for (const def of lib.TagSpecDefinitions) byId.set(def.Id, def);
  }
  for (const lib of editingLibraries) {
    for (const def of lib.TagSpecDefinitions) byId.set(def.Id, def);
  }
  const entries: MatchingTagEntry[] = ids.map((id) => ({
    id,
    def: byId.get(id),
    version: versions.get(id)?.version,
  }));
  entries.sort((a, b) => {
    if (!a.def && b.def) return 1;
    if (a.def && !b.def) return -1;
    const an = a.def?.Tag ?? a.id;
    const bn = b.def?.Tag ?? b.id;
    return an.localeCompare(bn, undefined, { sensitivity: 'base' });
  });
  return entries;
}
