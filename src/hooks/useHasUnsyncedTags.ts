import { useMemo } from 'react';
import { useTagSpecs } from './useTagSpecs';
import { computeDiff } from '../utils/tagHierarchyDiff';

export function useHasUnsyncedTags(): boolean {
  const { rawHierarchyNodes, originalRawNodes } = useTagSpecs();
  return useMemo(() => {
    const diff = computeDiff(rawHierarchyNodes, originalRawNodes);
    return diff.added.length + diff.removed.length + diff.modified.length > 0;
  }, [rawHierarchyNodes, originalRawNodes]);
}
