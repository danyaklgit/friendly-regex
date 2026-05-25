import { createContext, useReducer, useMemo, useRef, useEffect, useCallback, useState, type ReactNode, type Dispatch } from 'react';
import type { TagSpecDefinition, TagSpecLibrary, ContextEntry, TaggingProgressMap } from '../types';
import type { TepHeaders } from '../api/transactions';
import type { TagTreeNode, TagHierarchyRawNode, TagsHierarchyWrapper } from '../api/tagsHierarchy';
import { getTagSpecLibraries } from '../api/tagSpecs';
import { getRawTagsHierarchy, buildTagTree } from '../api/tagsHierarchy';
import { getContextValue } from '../types/tagSpec';
import { useAuth } from './AuthContext';
import sampleTagData from '../data/sample.json';
import sampleHierarchyData from '../data/sampleHiearchy.json';

// --- Helpers ---

/**
 * Merge localStorage draft (`tep:current:${bank}:${side}`) over the API lib ONLY when
 * the cached draft is still anchored to the same server version we just fetched.
 *
 * The cache is a user's in-progress edits; it must not silently shadow a backend
 * that has moved on (e.g. someone else saved, or this user saved from another
 * machine). We detect that by comparing Id + VersionDate. If they diverge, the
 * cache is stale — drop it and surface the fresh API data.
 */
function applyLocalDraftOrInvalidate(apiLib: TagSpecLibrary): TagSpecLibrary {
  if (apiLib.StatusTag !== 'INPROGRESS' || !apiLib.OperatorId) return apiLib;
  const bank = getContextValue(apiLib.Context, 'BankSwiftCode') ?? '';
  const side = getContextValue(apiLib.Context, 'Side') ?? '';
  if (!bank || !side) return apiLib;
  const currentKey = `tep:current:${bank}:${side}`;
  const baselineKey = `tep:baseline:${bank}:${side}`;
  try {
    const raw = localStorage.getItem(currentKey);
    if (!raw) return apiLib;
    const cached = JSON.parse(raw) as TagSpecLibrary;
    const stale =
      cached.Id !== apiLib.Id ||
      (apiLib.VersionDate && cached.VersionDate && cached.VersionDate < apiLib.VersionDate);
    if (stale) {
      localStorage.removeItem(currentKey);
      localStorage.removeItem(baselineKey);
      return apiLib;
    }
    return { ...apiLib, TagSpecDefinitions: cached.TagSpecDefinitions };
  } catch {
    return apiLib;
  }
}

/**
 * One-time migration: older builds could persist stale `tep:current:*` drafts that
 * silently shadowed fresh API data (see applyLocalDraftOrInvalidate above). The
 * version-aware merge only heals caches on a server-side VersionDate bump, so
 * existing stale drafts on users' browsers need a one-shot purge. Guarded by a
 * versioned flag so it runs exactly once per browser per bump.
 */
const CACHE_PURGE_FLAG = 'tep:cacheMigration:v1';
function runOneTimeCachePurge(): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(CACHE_PURGE_FLAG)) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('tep:current:') || k.startsWith('tep:baseline:'))) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) localStorage.removeItem(k);
    localStorage.setItem(CACHE_PURGE_FLAG, '1');
  } catch { /* localStorage unavailable — skip */ }
}
runOneTimeCachePurge();

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
      // Prefer INPROGRESS library when multiple share the same context (checked-out pair)
      let existingIdx = state.findIndex((lib) => lib.StatusTag === 'INPROGRESS' && contextsMatch(lib.Context, parentContext));
      if (existingIdx < 0) {
        existingIdx = state.findIndex((lib) => contextsMatch(lib.Context, parentContext));
      }

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

      // Prefer INPROGRESS library when multiple contain the same definition ID (checked-out pair)
      let currentLibIdx = state.findIndex((lib) =>
        lib.StatusTag === 'INPROGRESS' && lib.TagSpecDefinitions.some((d) => d.Id === definition.Id)
      );
      if (currentLibIdx < 0) {
        currentLibIdx = state.findIndex((lib) =>
          lib.TagSpecDefinitions.some((d) => d.Id === definition.Id)
        );
      }

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

        // Find or create target library (prefer INPROGRESS)
        let targetIdx = result.findIndex((lib) => lib.StatusTag === 'INPROGRESS' && contextsMatch(lib.Context, parentContext));
        if (targetIdx < 0) {
          targetIdx = result.findIndex((lib) => contextsMatch(lib.Context, parentContext));
        }
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
  /** Full refetch: libraries + TaggingProgress + hierarchy. Use on mount or after hierarchy edits. */
  refetchTagSpecs: () => Promise<void>;
  /** Lightweight refetch: only libraries + TaggingProgress. Use for polling and post-action refreshes. */
  refetchLibraries: () => Promise<void>;
  refetchHierarchy: () => Promise<void>;
  tagsHierarchy: TagTreeNode[];
  tagsHierarchyLoading: boolean;
  rawHierarchyNodes: TagHierarchyRawNode[];
  hierarchyWrapper: TagsHierarchyWrapper | null;
  originalRawNodes: TagHierarchyRawNode[];
  hierarchyDispatch: Dispatch<HierarchyAction>;
  setOriginalRawNodes: (nodes: TagHierarchyRawNode[]) => void;
  setHierarchyWrapper: (wrapper: TagsHierarchyWrapper | null) => void;
  // Background tagging progress (see GetTagSpecLibraries response `TaggingProgress` field)
  taggingProgress: TaggingProgressMap;
  /** Returns true when the given library Id has a tagging job in IN_PROGRESS status. */
  isLibraryBeingTagged: (libraryId: string | null | undefined) => boolean;
  /** Convenience: true when either Id or ActiveTagSpecLibId of the library is being tagged. */
  isPairBeingTagged: (lib: TagSpecLibrary | null | undefined) => boolean;
  /**
   * Returns the client-side timestamp (Date.now()) when this library's tagging entry
   * was first observed in a GetTagSpecLibraries response. Used to anchor "Elapsed"
   * counters to when WE started watching, not the backend's StartedAt (which can be far older).
   */
  getTaggingFirstSeen: (libraryId: string | null | undefined) => number | undefined;
}

interface TagSpecProviderProps {
  children: ReactNode;
  useDummyData: boolean;
  tepHeaders: TepHeaders | null;
}

export const TagSpecContext = createContext<TagSpecContextValue | null>(null);

function extractRawNodes(data: Record<string, unknown>): TagHierarchyRawNode[] {
  const outer = data.TagsHierarchy as Record<string, unknown> | unknown[];
  const raw = Array.isArray(outer) ? outer : (outer as Record<string, unknown>)?.TagsHierarchy ?? [];
  return raw as TagHierarchyRawNode[];
}

export function TagSpecProvider({ children, useDummyData, tepHeaders }: TagSpecProviderProps) {
  // Read the access token at *call time* via `getAuthHeaders` (a stable
  // useCallback in AuthContext) so token rotations from the silent keepalive
  // and the "Get More Time" button don't churn fetch callback identities,
  // which would otherwise re-fire the mount-fetch effect and surface a
  // page-wide loading skeleton. See AuthContext for the matching change.
  const { getAuthHeaders } = useAuth();
  const initialData = useDummyData ? (sampleTagData as TagSpecLibrary[]) : [];
  const [libraries, dispatch] = useReducer(tagSpecReducer, initialData);
  const tagDefinitions = useMemo(() => flattenDefinitions(libraries), [libraries]);
  const [loading, setLoading] = useState(!useDummyData);
  const [tagsHierarchyLoading, setTagsHierarchyLoading] = useState(!useDummyData);
  const [taggingProgress, setTaggingProgress] = useState<TaggingProgressMap>({});
  // Client-side first-seen timestamps, keyed by TagSpecLibraryId. Populated on every poll;
  // entries for libraries that leave the TaggingProgress map get pruned on the same pass.
  const firstSeenRef = useRef<Map<string, number>>(new Map());

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

  const isFetchingRef = useRef(false);
  const isFetchingLibsRef = useRef(false);

  // Lightweight: only libraries + TaggingProgress. Skips hierarchy entirely.
  // Used by polling and post-action refreshes where hierarchy data doesn't change.
  const fetchLibrariesOnly = useCallback(async () => {
    if (useDummyData || !tepHeaders) return;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return;
    if (isFetchingLibsRef.current) return;
    isFetchingLibsRef.current = true;
    try {
      const libsResult = await getTagSpecLibraries(authToken, tepHeaders);
      const libsData = libsResult.libraries;
      setTaggingProgress(libsResult.taggingProgress);
      // Record first-seen timestamps for newly-observed tagging entries; prune removed ones.
      const observedAt = Date.now();
      const currentIds = new Set(Object.keys(libsResult.taggingProgress));
      for (const libId of currentIds) {
        if (!firstSeenRef.current.has(libId)) {
          firstSeenRef.current.set(libId, observedAt);
        }
      }
      for (const libId of Array.from(firstSeenRef.current.keys())) {
        if (!currentIds.has(libId)) {
          firstSeenRef.current.delete(libId);
        }
      }
      // Merge localStorage draft overrides for checked-out pairs, but only when the
      // cached draft is still anchored to the server version we just fetched.
      const mergedLibs = libsData.map(applyLocalDraftOrInvalidate);
      dispatch({ type: 'REPLACE_ALL', payload: mergedLibs });
      const ids = flattenDefinitions(mergedLibs).map((d) => d.Id);
      for (const id of ids) originalDefinitionIds.add(id);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Failed to fetch libraries:', err);
    } finally {
      isFetchingLibsRef.current = false;
    }
  }, [useDummyData, tepHeaders, getAuthHeaders, originalDefinitionIds]);

  const fetchTagSpecs = useCallback(async (signal?: AbortSignal) => {
    if (useDummyData || !tepHeaders) return;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setTagsHierarchyLoading(true);
    try {
      const [libsResult, wrapperData] = await Promise.all([
        getTagSpecLibraries(authToken, tepHeaders, signal),
        getRawTagsHierarchy(authToken, tepHeaders, signal),
      ]);
      const libsData = libsResult.libraries;
      setTaggingProgress(libsResult.taggingProgress);
      // Record first-seen timestamps for newly-observed tagging entries; prune removed ones.
      const observedAt = Date.now();
      const currentIds = new Set(Object.keys(libsResult.taggingProgress));
      for (const libId of currentIds) {
        if (!firstSeenRef.current.has(libId)) {
          firstSeenRef.current.set(libId, observedAt);
        }
      }
      for (const libId of Array.from(firstSeenRef.current.keys())) {
        if (!currentIds.has(libId)) {
          firstSeenRef.current.delete(libId);
        }
      }
      // Merge localStorage draft overrides for checked-out pairs, but only when the
      // cached draft is still anchored to the server version we just fetched.
      const mergedLibs = libsData.map(applyLocalDraftOrInvalidate);
      dispatch({ type: 'REPLACE_ALL', payload: mergedLibs });
      const ids = flattenDefinitions(mergedLibs).map((d) => d.Id);
      for (const id of ids) originalDefinitionIds.add(id);
      hierarchyDispatch({ type: 'REPLACE_ALL', payload: wrapperData.TagsHierarchy });
      setOriginalRawNodes(wrapperData.TagsHierarchy);
      setHierarchyWrapper(wrapperData);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Failed to fetch tag spec data:', err);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setTagsHierarchyLoading(false);
    }
  }, [useDummyData, tepHeaders, getAuthHeaders, originalDefinitionIds]);

  // Fetch on mount in live mode
  useEffect(() => {
    if (useDummyData) return;
    const controller = new AbortController();
    fetchTagSpecs(controller.signal);
    return () => controller.abort();
  }, [useDummyData, fetchTagSpecs]);

  const refetchTagSpecs = useCallback(() => {
    return fetchTagSpecs();
  }, [fetchTagSpecs]);

  const refetchLibraries = useCallback(() => {
    return fetchLibrariesOnly();
  }, [fetchLibrariesOnly]);

  // Background polling: while ANY tagging job is IN_PROGRESS, refetch libraries every
  // 6 seconds so ProcessedTransactions updates live. Uses the lightweight path — no
  // hierarchy fetch — since the tag tree doesn't change during tagging.
  useEffect(() => {
    if (useDummyData) return;
    const hasActive = Object.values(taggingProgress).some((e) => e.Status === 'IN_PROGRESS');
    if (!hasActive) return;
    const id = setInterval(() => { refetchLibraries(); }, 6000);
    return () => clearInterval(id);
  }, [taggingProgress, useDummyData, refetchLibraries]);

  const isLibraryBeingTagged = useCallback(
    (libraryId: string | null | undefined): boolean => {
      if (!libraryId) return false;
      return taggingProgress[libraryId]?.Status === 'IN_PROGRESS';
    },
    [taggingProgress],
  );

  const isPairBeingTagged = useCallback(
    (lib: TagSpecLibrary | null | undefined): boolean => {
      if (!lib) return false;
      return isLibraryBeingTagged(lib.Id) || isLibraryBeingTagged(lib.ActiveTagSpecLibId);
    },
    [isLibraryBeingTagged],
  );

  const getTaggingFirstSeen = useCallback(
    (libraryId: string | null | undefined): number | undefined => {
      if (!libraryId) return undefined;
      return firstSeenRef.current.get(libraryId);
    },
    [],
  );

  const refetchHierarchy = useCallback(async () => {
    if (useDummyData) {
      // In dummy mode, reset to sample data
      const nodes = extractRawNodes(sampleHierarchyData as Record<string, unknown>);
      hierarchyDispatch({ type: 'REPLACE_ALL', payload: nodes });
      setOriginalRawNodes(nodes);
      return;
    }
    if (!tepHeaders) return;
    const authToken = getAuthHeaders().Authorization?.replace('Bearer ', '') ?? '';
    if (!authToken) return;
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
  }, [useDummyData, tepHeaders, getAuthHeaders]);

  const value = useMemo<TagSpecContextValue>(() => ({
    libraries, tagDefinitions, originalDefinitionIds, dispatch, loading, refetchTagSpecs, refetchLibraries, refetchHierarchy,
    tagsHierarchy, tagsHierarchyLoading,
    rawHierarchyNodes, hierarchyWrapper, originalRawNodes, hierarchyDispatch,
    setOriginalRawNodes, setHierarchyWrapper,
    taggingProgress, isLibraryBeingTagged, isPairBeingTagged, getTaggingFirstSeen,
  }), [libraries, tagDefinitions, originalDefinitionIds, loading, refetchTagSpecs, refetchLibraries, refetchHierarchy, tagsHierarchy, tagsHierarchyLoading, rawHierarchyNodes, hierarchyWrapper, originalRawNodes, taggingProgress, isLibraryBeingTagged, isPairBeingTagged, getTaggingFirstSeen]);

  return (
    <TagSpecContext.Provider value={value}>
      {children}
    </TagSpecContext.Provider>
  );
}
