import { useMemo } from 'react';
import { useTagSpecs } from './useTagSpecs';
import type { TagSpecLibrary } from '../types/tagSpec';

/** Build an indexed view of libraries by id so comment search results can
 *  resolve Bank, Side, and tag names without scanning the array per row. */
export function useLibraryLookup(): Map<string, TagSpecLibrary> {
  const { libraries } = useTagSpecs();
  return useMemo(() => {
    const map = new Map<string, TagSpecLibrary>();
    for (const lib of libraries) {
      if (lib.Id) map.set(lib.Id, lib);
    }
    return map;
  }, [libraries]);
}
