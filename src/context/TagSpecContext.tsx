import { createContext, useReducer, useMemo, useRef, useEffect, useCallback, useState, type ReactNode, type Dispatch } from 'react';
import type { TagSpecDefinition, TagSpecLibrary, ContextEntry } from '../types';
import type { TepHeaders } from '../api/transactions';
import type { TagTreeNode, TagHierarchyRawNode, TagsHierarchyWrapper } from '../api/tagsHierarchy';
import { getTagSpecLibraries } from '../api/tagSpecs';
import { getRawTagsHierarchy, buildTagTree } from '../api/tagsHierarchy';
import sampleTagData from '../data/sample.json';
import sampleHierarchyData from '../data/sampleHiearchy.json';

// --- Helpers ---

/** Compare two ContextEntry[] arrays for equality (order-insensitive) */
export function contextsMatch(a: ContextEntry[], b: ContextEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entryA) =>
    b.some((entryB) => entryB.Key === entryA.Key && entryB.Value === entryA.Value)
  );
}

/** Flatten all definitions from all libraries into a single array */
export function flattenDefinitions(libraries: TagSpecLibrary[]): TagSpecDefinition[] {
  return libraries.flatMap((lib) => lib.TagSpecDefinitions);
}

// --- Actions ---

export type TagSpecAction =
  | { type: 'ADD'; payload: { parentContext: ContextEntry[]; definition: TagSpecDefinition } }
  | { type: 'UPDATE'; payload: { parentContext: ContextEntry[]; definition: TagSpecDefinition } }
  | { type: 'DELETE'; payload: { definitionId: string } }
  | { type: 'IMPORT'; payload: TagSpecLibrary[] }
  | { type: 'REPLACE_ALL'; payload: TagSpecLibrary[] };

function createEmptyLibrary(parentContext: ContextEntry[]): TagSpecLibrary {
  return {
    Id: crypto.randomUUID(),
    ActiveTagSpecLibId: null,
    OperatorId: '',
    StatusTag: 'ACTIVE',
    DataSetType: 'MT940',
    Version: 1,
    IsLatestVersion: true,
    VersionDate: new Date().toISOString().split('T')[0],
    Context: parentContext,
    TagSpecDefinitions: [],
  };
}

function tagSpecReducer(
  state: TagSpecLibrary[],
  action: TagSpecAction
): TagSpecLibrary[] {
  switch (action.type) {
    case 'ADD': {
      const { parentContext, definition } = action.payload;
      const existingIdx = state.findIndex((lib) => contextsMatch(lib.Context, parentContext));

      if (existingIdx >= 0) {
        // Append definition to existing library
        return state.map((lib, i) =>
          i === existingIdx
            ? { ...lib, TagSpecDefinitions: [...lib.TagSpecDefinitions, definition] }
            : lib
        );
      } else {
        // Create a new library with this definition
        const newLib = createEmptyLibrary(parentContext);
        newLib.TagSpecDefinitions = [definition];
        return [...state, newLib];
      }
    }

    case 'UPDATE': {
      const { parentContext, definition } = action.payload;

      // First, find the library that currently contains this definition
      const currentLibIdx = state.findIndex((lib) =>
        lib.TagSpecDefinitions.some((d) => d.Id === definition.Id)
      );

      if (currentLibIdx < 0) return state;

      const currentLib = state[currentLibIdx];
      const sameParent = contextsMatch(currentLib.Context, parentContext);

      if (sameParent) {
        // Update in place
        return state.map((lib, i) =>
          i === currentLibIdx
            ? {
                ...lib,
                TagSpecDefinitions: lib.TagSpecDefinitions.map((d) =>
                  d.Id === definition.Id ? definition : d
                ),
              }
            : lib
        );
      } else {
        // Move to a different library: remove from current, add to target
        let result = state.map((lib, i) =>
          i === currentLibIdx
            ? { ...lib, TagSpecDefinitions: lib.TagSpecDefinitions.filter((d) => d.Id !== definition.Id) }
            : lib
        );

        // Remove empty libraries
        result = result.filter((lib) => lib.TagSpecDefinitions.length > 0);

        // Find or create target library
        const targetIdx = result.findIndex((lib) => contextsMatch(lib.Context, parentContext));
        if (targetIdx >= 0) {
          result = result.map((lib, i) =>
            i === targetIdx
              ? { ...lib, TagSpecDefinitions: [...lib.TagSpecDefinitions, definition] }
              : lib
          );
        } else {
          const newLib = createEmptyLibrary(parentContext);
          newLib.TagSpecDefinitions = [definition];
          result = [...result, newLib];
        }

        return result;
      }
    }

    case 'DELETE': {
      const { definitionId } = action.payload;
      const result = state
        .map((lib) => ({
          ...lib,
          TagSpecDefinitions: lib.TagSpecDefinitions.filter((d) => d.Id !== definitionId),
        }))
        .filter((lib) => lib.TagSpecDefinitions.length > 0);
      return result;
    }

    case 'IMPORT': {
      // Replace all existing libraries with the imported ones
      return action.payload;
    }

    case 'REPLACE_ALL':
      return action.payload;

    default:
      return state;
  }
}

// --- Hierarchy reducer ---

export type HierarchyAction =
  | { type: 'REPLACE_ALL'; payload: TagHierarchyRawNode[] }
  | { type: 'ADD_NODE'; payload: TagHierarchyRawNode }
  | { type: 'UPDATE_NODE'; payload: { tag: string; updates: Partial<TagHierarchyRawNode> } }
  | { type: 'DELETE_NODE'; payload: { tag: string } };

function hierarchyReducer(
  state: TagHierarchyRawNode[],
  action: HierarchyAction,
): TagHierarchyRawNode[] {
  switch (action.type) {
    case 'REPLACE_ALL':
      return action.payload;

    case 'ADD_NODE':
      return [...state, action.payload];

    case 'UPDATE_NODE': {
      const { tag, updates } = action.payload;
      return state.map((n) => (n.Tag === tag ? { ...n, ...updates } : n));
    }

    case 'DELETE_NODE': {
      const deletedTag = action.payload.tag;
      return state
        .filter((n) => n.Tag !== deletedTag)
        .map((n) => ({
          ...n,
          ParentTag: n.ParentTag === deletedTag ? null : n.ParentTag,
          GroupTags: n.GroupTags ? n.GroupTags.filter((g) => g !== deletedTag) : n.GroupTags,
        }));
    }

    default:
      return state;
  }
}

// --- Context ---

export interface TagSpecContextValue {
  libraries: TagSpecLibrary[];
  tagDefinitions: TagSpecDefinition[];
  originalDefinitionIds: Set<string>;
  dispatch: Dispatch<TagSpecAction>;
  loading: boolean;
  refetchTagSpecs: () => void;
  refetchHierarchy: () => Promise<void>;
  tagsHierarchy: TagTreeNode[];
  tagsHierarchyLoading: boolean;
  rawHierarchyNodes: TagHierarchyRawNode[];
  hierarchyWrapper: TagsHierarchyWrapper | null;
  originalRawNodes: TagHierarchyRawNode[];
  hierarchyDispatch: Dispatch<HierarchyAction>;
  setOriginalRawNodes: (nodes: TagHierarchyRawNode[]) => void;
  setHierarchyWrapper: (wrapper: TagsHierarchyWrapper | null) => void;
}

interface TagSpecProviderProps {
  children: ReactNode;
  useDummyData: boolean;
  authToken: string | null;
  tepHeaders: TepHeaders | null;
}

export const TagSpecContext = createContext<TagSpecContextValue | null>(null);

function extractRawNodes(data: Record<string, unknown>): TagHierarchyRawNode[] {
  const outer = data.TagsHierarchy as Record<string, unknown> | unknown[];
  const raw = Array.isArray(outer) ? outer : (outer as Record<string, unknown>)?.TagsHierarchy ?? [];
  return raw as TagHierarchyRawNode[];
}

export function TagSpecProvider({ children, useDummyData, authToken, tepHeaders }: TagSpecProviderProps) {
  const initialData = useDummyData ? (sampleTagData as TagSpecLibrary[]) : [];
  const [libraries, dispatch] = useReducer(tagSpecReducer, initialData);
  const tagDefinitions = useMemo(() => flattenDefinitions(libraries), [libraries]);
  const [loading, setLoading] = useState(!useDummyData);
  const [tagsHierarchyLoading, setTagsHierarchyLoading] = useState(!useDummyData);

  // Raw hierarchy state
  const initialRawNodes = useMemo(() => {
    if (!useDummyData) return [];
    return extractRawNodes(sampleHierarchyData as Record<string, unknown>);
  }, [useDummyData]);

  const [rawHierarchyNodes, hierarchyDispatch] = useReducer(hierarchyReducer, initialRawNodes);
  const [originalRawNodes, setOriginalRawNodes] = useState<TagHierarchyRawNode[]>(initialRawNodes);
  const [hierarchyWrapper, setHierarchyWrapper] = useState<TagsHierarchyWrapper | null>(() => {
    if (!useDummyData) return null;
    const outer = (sampleHierarchyData as Record<string, unknown>).TagsHierarchy as Record<string, unknown>;
    return {
      Id: (outer.Id as string) ?? '',
      DataSetType: (outer.DataSetType as string) ?? 'MT940',
      IsLatestVersion: (outer.IsLatestVersion as boolean) ?? true,
      VersionDate: (outer.VersionDate as string) ?? new Date().toISOString(),
      TagsHierarchy: [],  // filled from reducer state on save
    };
  });

  // Derive built tree from raw nodes for TagTreePicker
  const tagsHierarchy = useMemo(() => buildTagTree(rawHierarchyNodes), [rawHierarchyNodes]);

  // Capture IDs from the initially loaded data (predefined); anything else is user-created
  const originalDefinitionIds = useRef(
    new Set(flattenDefinitions(initialData).map((d) => d.Id))
  ).current;

  const fetchTagSpecs = useCallback(async (signal?: AbortSignal) => {
    if (useDummyData || !authToken || !tepHeaders) return;
    setLoading(true);
    setTagsHierarchyLoading(true);
    try {
      const [libsData, wrapperData] = await Promise.all([
        getTagSpecLibraries(authToken, tepHeaders, signal),
        getRawTagsHierarchy(authToken, tepHeaders, signal),
      ]);
      dispatch({ type: 'REPLACE_ALL', payload: libsData });
      const ids = flattenDefinitions(libsData).map((d) => d.Id);
      for (const id of ids) originalDefinitionIds.add(id);
      hierarchyDispatch({ type: 'REPLACE_ALL', payload: wrapperData.TagsHierarchy });
      setOriginalRawNodes(wrapperData.TagsHierarchy);
      setHierarchyWrapper(wrapperData);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Failed to fetch tag spec data:', err);
    } finally {
      setLoading(false);
      setTagsHierarchyLoading(false);
    }
  }, [useDummyData, authToken, tepHeaders, originalDefinitionIds]);

  // Fetch on mount in live mode
  useEffect(() => {
    if (useDummyData) return;
    const controller = new AbortController();
    fetchTagSpecs(controller.signal);
    return () => controller.abort();
  }, [useDummyData, fetchTagSpecs]);

  const refetchTagSpecs = useCallback(() => {
    fetchTagSpecs();
  }, [fetchTagSpecs]);

  const refetchHierarchy = useCallback(async () => {
    if (useDummyData) {
      // In dummy mode, reset to sample data
      const nodes = extractRawNodes(sampleHierarchyData as Record<string, unknown>);
      hierarchyDispatch({ type: 'REPLACE_ALL', payload: nodes });
      setOriginalRawNodes(nodes);
      return;
    }
    if (!authToken || !tepHeaders) return;
    setTagsHierarchyLoading(true);
    try {
      const wrapperData = await getRawTagsHierarchy(authToken, tepHeaders);
      hierarchyDispatch({ type: 'REPLACE_ALL', payload: wrapperData.TagsHierarchy });
      setOriginalRawNodes(wrapperData.TagsHierarchy);
      setHierarchyWrapper(wrapperData);
    } catch (err) {
      console.error('Failed to refetch tags hierarchy:', err);
    } finally {
      setTagsHierarchyLoading(false);
    }
  }, [useDummyData, authToken, tepHeaders]);

  const value = useMemo<TagSpecContextValue>(() => ({
    libraries, tagDefinitions, originalDefinitionIds, dispatch, loading, refetchTagSpecs, refetchHierarchy,
    tagsHierarchy, tagsHierarchyLoading,
    rawHierarchyNodes, hierarchyWrapper, originalRawNodes, hierarchyDispatch,
    setOriginalRawNodes, setHierarchyWrapper,
  }), [libraries, tagDefinitions, originalDefinitionIds, loading, refetchTagSpecs, tagsHierarchy, tagsHierarchyLoading, rawHierarchyNodes, hierarchyWrapper, originalRawNodes]);

  return (
    <TagSpecContext.Provider value={value}>
      {children}
    </TagSpecContext.Provider>
  );
}
