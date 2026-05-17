import type { TagSpecLibrary } from '../types';

export interface DefinitionVersionInfo {
  version: number;
  total: number;
}

export function computeDefinitionVersions(
  library: TagSpecLibrary | null,
): Map<string, DefinitionVersionInfo> {
  const result = new Map<string, DefinitionVersionInfo>();
  if (!library) return result;

  const idsByTag = new Map<string, string[]>();
  for (const def of library.TagSpecDefinitions ?? []) {
    const list = idsByTag.get(def.Tag);
    if (list) list.push(def.Id);
    else idsByTag.set(def.Tag, [def.Id]);
  }

  for (const ids of idsByTag.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      result.set(ids[i], { version: i + 1, total: ids.length });
    }
  }

  return result;
}
