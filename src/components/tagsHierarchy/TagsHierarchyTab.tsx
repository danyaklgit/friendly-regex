import { useState, useMemo, useCallback, useRef } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import type { TagHierarchyRawNode } from '../../api/tagsHierarchy';
import { saveTagsHierarchy } from '../../api/tagsHierarchy';
import { computeDiff } from './SyncReviewModal';
import { TagEditModal } from './TagEditModal';
import { SyncReviewModal } from './SyncReviewModal';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { Toast } from '../shared/Toast';
import { EmptyState } from '../shared/EmptyState';
import type { TepHeaders } from '../../api/transactions';

function getNodeName(node: TagHierarchyRawNode): string {
  return node.Details?.find((d) => d.LanguageCode === 'en')?.Name ?? node.Tag;
}

function getNodeDesc(node: TagHierarchyRawNode): string {
  return node.Details?.find((d) => d.LanguageCode === 'en')?.Description ?? '';
}

function highlightText(text: string, q: string) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-500/60 rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

interface GroupedView {
  groupTag: string;
  groupName: string;
  groupNode: TagHierarchyRawNode | null; // null for "Ungrouped"
  leaves: TagHierarchyRawNode[];
}

export function TagsHierarchyTab() {
  const {
    rawHierarchyNodes, originalRawNodes, hierarchyWrapper,
    hierarchyDispatch, setOriginalRawNodes, setHierarchyWrapper,
    tagsHierarchyLoading, refetchHierarchy,
  } = useTagSpecs();
  const { getAuthHeaders, userId, useDummyData } = useAuth();
  const tepConfig = useTepConfig();

  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<TagHierarchyRawNode | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TagHierarchyRawNode | null>(null);
  const [lastArchived, setLastArchived] = useState<{ tag: string; previousStatus: string } | null>(null);
  const archiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const query = search.toLowerCase().trim();

  const originalTagSet = useMemo(
    () => new Set(originalRawNodes.map((n) => n.Tag)),
    [originalRawNodes],
  );

  // Track which existing tags have been modified
  const modifiedTagSet = useMemo(() => {
    const set = new Set<string>();
    const originalMap = new Map(originalRawNodes.map((n) => [n.Tag, n]));
    for (const node of rawHierarchyNodes) {
      const orig = originalMap.get(node.Tag);
      if (!orig) continue;
      const origName = getNodeName(orig);
      const curName = getNodeName(node);
      const origDesc = getNodeDesc(orig);
      const curDesc = getNodeDesc(node);
      if (
        node.StatusTag !== orig.StatusTag ||
        curName !== origName ||
        curDesc !== origDesc ||
        node.ParentTag !== orig.ParentTag ||
        JSON.stringify((node.GroupTags ?? []).sort()) !== JSON.stringify((orig.GroupTags ?? []).sort())
      ) {
        set.add(node.Tag);
      }
    }
    return set;
  }, [rawHierarchyNodes, originalRawNodes]);

  // Priority: 0 = new, 1 = rest (modified stay in alphabetical position)
  const getPriority = (tag: string) => {
    if (!originalTagSet.has(tag)) return 0;
    return 1;
  };

  // Build grouped view from raw flat nodes — sorted: new first, modified second, rest
  const groupedView = useMemo<GroupedView[]>(() => {
    const groups = rawHierarchyNodes.filter((n) => n.Level === 'G');
    const leaves = rawHierarchyNodes.filter((n) => n.Level === 'T');

    const groupMap = new Map<string, GroupedView>();
    for (const g of groups) {
      groupMap.set(g.Tag, {
        groupTag: g.Tag,
        groupName: getNodeName(g),
        groupNode: g,
        leaves: [],
      });
    }

    const ungrouped: TagHierarchyRawNode[] = [];
    for (const leaf of leaves) {
      if (!leaf.GroupTags || leaf.GroupTags.length === 0) {
        ungrouped.push(leaf);
        continue;
      }
      for (const gt of leaf.GroupTags) {
        const group = groupMap.get(gt);
        if (group) group.leaves.push(leaf);
      }
    }

    // Sort groups: new first, then alphabetically
    const result = Array.from(groupMap.values()).sort((a, b) => {
      const aPri = a.groupNode ? getPriority(a.groupTag) : 2;
      const bPri = b.groupNode ? getPriority(b.groupTag) : 2;
      if (aPri !== bPri) return aPri - bPri;
      return a.groupName.localeCompare(b.groupName);
    });

    // Sort leaves within each group: new first, then alphabetically
    for (const g of result) {
      g.leaves.sort((a, b) => {
        const aPri = getPriority(a.Tag);
        const bPri = getPriority(b.Tag);
        if (aPri !== bPri) return aPri - bPri;
        return a.Tag.localeCompare(b.Tag);
      });
    }

    if (ungrouped.length > 0) {
      ungrouped.sort((a, b) => {
        const aPri = getPriority(a.Tag);
        const bPri = getPriority(b.Tag);
        if (aPri !== bPri) return aPri - bPri;
        return a.Tag.localeCompare(b.Tag);
      });
      result.push({ groupTag: '__ungrouped__', groupName: 'Ungrouped', groupNode: null, leaves: ungrouped });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawHierarchyNodes, originalTagSet, modifiedTagSet]);

  // Filter groups/leaves by search
  const filteredView = useMemo<GroupedView[]>(() => {
    if (!query) return groupedView;
    return groupedView
      .map((g) => {
        const groupMatches =
          g.groupTag.toLowerCase().includes(query) ||
          g.groupName.toLowerCase().includes(query);

        const matchingLeaves = g.leaves.filter(
          (l) =>
            l.Tag.toLowerCase().includes(query) ||
            getNodeName(l).toLowerCase().includes(query) ||
            getNodeDesc(l).toLowerCase().includes(query),
        );

        if (groupMatches) return g; // show all leaves when group matches
        if (matchingLeaves.length > 0) return { ...g, leaves: matchingLeaves };
        return null;
      })
      .filter((g): g is GroupedView => g !== null);
  }, [groupedView, query]);

  const hasChanges = useMemo(
    () => {
      const diff = computeDiff(rawHierarchyNodes, originalRawNodes);
      return diff.added.length + diff.removed.length + diff.modified.length > 0;
    },
    [rawHierarchyNodes, originalRawNodes],
  );

  const toggleGroup = (groupTag: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupTag)) next.delete(groupTag);
      else next.add(groupTag);
      return next;
    });
  };

  const handleCreate = () => {
    setEditingNode(null);
    setEditModalOpen(true);
  };

  const handleEdit = (node: TagHierarchyRawNode) => {
    setEditingNode(node);
    setEditModalOpen(true);
  };

  const handleSaveNode = (node: TagHierarchyRawNode) => {
    if (editingNode) {
      hierarchyDispatch({ type: 'UPDATE_NODE', payload: { tag: editingNode.Tag, updates: node } });
    } else {
      hierarchyDispatch({ type: 'ADD_NODE', payload: node });
    }
  };

  const handleArchive = (node: TagHierarchyRawNode) => {
    const previousStatus = node.StatusTag;
    hierarchyDispatch({ type: 'UPDATE_NODE', payload: { tag: node.Tag, updates: { StatusTag: 'ARCHIVED' } } });
    setLastArchived({ tag: node.Tag, previousStatus });
    if (archiveTimerRef.current) clearTimeout(archiveTimerRef.current);
    archiveTimerRef.current = setTimeout(() => setLastArchived(null), 10000); // 10 seconds to undo
  };

  const handleUndoArchive = () => {
    if (!lastArchived) return;
    hierarchyDispatch({ type: 'UPDATE_NODE', payload: { tag: lastArchived.tag, updates: { StatusTag: lastArchived.previousStatus } } });
    setLastArchived(null);
    if (archiveTimerRef.current) clearTimeout(archiveTimerRef.current);
  };

  const handleActivate = (node: TagHierarchyRawNode) => {
    hierarchyDispatch({ type: 'UPDATE_NODE', payload: { tag: node.Tag, updates: { StatusTag: 'ACTIVE' } } });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    hierarchyDispatch({ type: 'DELETE_NODE', payload: { tag: deleteTarget.Tag } });
    setDeleteTarget(null);
    setToast({ message: `Tag "${deleteTarget.Tag}" deleted`, type: 'success' });
  };

  const authToken = useMemo(() => {
    const headers = getAuthHeaders();
    const auth = headers['Authorization'];
    return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  }, [getAuthHeaders]);

  const tepHeaders = useMemo((): TepHeaders | null => {
    if (!userId) return null;
    return {
      apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
      userId,
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
  }, [userId, tepConfig]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchHierarchy();
      setToast({ message: 'Tags hierarchy refreshed', type: 'success' });
    } catch {
      setToast({ message: 'Failed to refresh tags hierarchy', type: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, [refetchHierarchy]);

  const handleSync = useCallback(async () => {
    if (!hierarchyWrapper) return;
    if (useDummyData) {
      setOriginalRawNodes([...rawHierarchyNodes]);
      setSyncModalOpen(false);
      setToast({ message: 'Tags synced (dummy mode)', type: 'success' });
      // Show loader briefly then refetch
      setRefreshing(true);
      await new Promise((r) => setTimeout(r, 2000));
      await refetchHierarchy();
      setRefreshing(false);
      return;
    }
    if (!authToken || !tepHeaders) return;
    setSyncing(true);
    try {
      const payload = { ...hierarchyWrapper, TagsHierarchy: rawHierarchyNodes };
      await saveTagsHierarchy(authToken, tepHeaders, payload);
      setSyncModalOpen(false);
      setToast({ message: 'Tags synced successfully', type: 'success' });
      // Show loader for 2 seconds then refetch from server
      setSyncing(false);
      setRefreshing(true);
      await new Promise((r) => setTimeout(r, 2000));
      await refetchHierarchy();
      setRefreshing(false);
    } catch (err) {
      console.error('Failed to sync tags:', err);
      setToast({ message: 'Failed to sync tags', type: 'error' });
      setSyncing(false);
    }
  }, [hierarchyWrapper, rawHierarchyNodes, authToken, tepHeaders, useDummyData, setOriginalRawNodes, setHierarchyWrapper, refetchHierarchy]);

  // Background class helpers for new / modified visual states
  const getGroupBgClass = (groupTag: string) => {
    if (!originalTagSet.has(groupTag)) return 'bg-blue-100/70 dark:bg-blue-900/20';
    if (modifiedTagSet.has(groupTag)) return 'bg-amber-100/70 dark:bg-amber-900/20';
    return '';
  };

  const getLeafBgClass = (tag: string) => {
    if (!originalTagSet.has(tag)) return 'bg-blue-50 dark:bg-blue-900/15';
    if (modifiedTagSet.has(tag)) return 'bg-amber-50 dark:bg-amber-900/15';
    return '';
  };

  if (tagsHierarchyLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted">
        Loading tags hierarchy...
      </div>
    );
  }

  if (rawHierarchyNodes.length === 0) {
    return (
      <EmptyState
        title="No Tags"
        description="No tags hierarchy available."
        action={<Button variant="primary" onClick={handleCreate}>Create Tag</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search tags..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (!e.target.value.trim()) setExpandedGroups(new Set()); }}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button variant="primary" size="sm" onClick={handleCreate}>
            + New Tag
          </Button>
          {hasChanges && (
            <Button variant="secondary" size="sm" onClick={() => setSyncModalOpen(true)}>
              Sync Tags
            </Button>
          )}
        </div>
      </div>

      {/* Tree view */}
      <div className="rounded-xl border border-border bg-surface-elevated shadow-sm overflow-hidden">
        {filteredView.length === 0 ? (
          <div className="text-sm text-muted text-center py-10">No tags match your search</div>
        ) : (
          filteredView.map((group) => {
            const isGroupNew = group.groupNode && !originalTagSet.has(group.groupTag);
            const isGroupModified = group.groupNode && modifiedTagSet.has(group.groupTag);
            const groupActions = group.groupNode?.Actions ?? [];

            return (
              <div key={group.groupTag} className="border-b border-border last:border-b-0">
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => { if (!query) toggleGroup(group.groupTag); }}
                  className={`flex items-center w-full text-left px-4 py-2.5 hover:bg-surface-hover transition-colors cursor-pointer
                    ${group.groupNode && group.groupNode.StatusTag !== 'ACTIVE' ? 'opacity-50' : ''}
                    ${group.groupNode ? getGroupBgClass(group.groupTag) : ''}`}
                >
                  <svg
                    className={`w-4 h-4 mr-2 flex-shrink-0 transition-transform text-muted ${(query || expandedGroups.has(group.groupTag)) ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium text-heading text-sm">{highlightText(group.groupName, query)}</span>
                  <span className="ml-2 text-xs text-muted">({highlightText(group.groupTag, query)})</span>
                  <Badge variant="default">{group.leaves.length}</Badge>
                  {group.groupNode && (
                    <span className="ml-auto flex items-center gap-2">
                      {group.groupNode.StatusTag !== 'ACTIVE' && (
                        <Badge variant="warning">{group.groupNode.StatusTag}</Badge>
                      )}
                      {isGroupNew && <Badge variant="info">NEW</Badge>}
                      {isGroupModified && !isGroupNew && <Badge variant="warning">EDITED</Badge>}
                      <span className="ml-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleEdit(group.groupNode!)}
                          className="p-1.5 rounded hover:bg-surface-active text-muted hover:text-heading transition-colors"
                          title="Edit group"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>

                        {groupActions.includes('Archive') && group.groupNode!.StatusTag === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => handleArchive(group.groupNode!)}
                            className="p-1.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/20 text-muted hover:text-yellow-600 transition-colors"
                            title="Archive"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                          </button>
                        )}

                        {groupActions.includes('Activate') && group.groupNode!.StatusTag !== 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => handleActivate(group.groupNode!)}
                            className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/20 text-muted hover:text-green-600 transition-colors"
                            title="Activate"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        )}

                        {groupActions.includes('Delete') && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(group.groupNode!)}
                            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-muted hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </span>
                    </span>
                  )}
                </button>

                {/* Leaves */}
                {(query || expandedGroups.has(group.groupTag)) && (
                  <div className="bg-surface-secondary/30">
                    {group.leaves.map((leaf) => {
                      const isNew = !originalTagSet.has(leaf.Tag);
                      const isModified = !isNew && modifiedTagSet.has(leaf.Tag);
                      const isInactive = leaf.StatusTag !== 'ACTIVE';
                      const actions = leaf.Actions ?? [];
                      return (
                        <div
                          key={`${group.groupTag}-${leaf.Tag}`}
                          className={`flex items-center px-4 py-2 pl-10 border-t border-border/50 hover:bg-surface-hover transition-colors text-sm
                            ${isInactive ? 'opacity-50' : ''}
                            ${getLeafBgClass(leaf.Tag)}`}
                        >
                          <span className="font-medium text-heading">{highlightText(leaf.Tag, query)}</span>
                          <span className="ml-2 text-muted text-xs truncate">— {highlightText(getNodeName(leaf), query)}</span>

                          <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                            {isNew && <Badge variant="info">NEW</Badge>}
                            {isModified && <Badge variant="warning">EDITED</Badge>}
                            <Badge variant={leaf.StatusTag === 'ACTIVE' ? 'success' : 'warning'}>
                              {leaf.StatusTag}
                            </Badge>

                            <span className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => handleEdit(leaf)}
                                className="p-1.5 rounded hover:bg-surface-active text-muted hover:text-heading transition-colors"
                                title="Edit"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>

                              {actions.includes('Archive') && leaf.StatusTag === 'ACTIVE' && (
                                <button
                                  type="button"
                                  onClick={() => handleArchive(leaf)}
                                  className="p-1.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/20 text-muted hover:text-yellow-600 transition-colors"
                                  title="Archive"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                  </svg>
                                </button>
                              )}

                              {actions.includes('Activate') && leaf.StatusTag !== 'ACTIVE' && (
                                <button
                                  type="button"
                                  onClick={() => handleActivate(leaf)}
                                  className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/20 text-muted hover:text-green-600 transition-colors"
                                  title="Activate"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                              )}

                              {actions.includes('Delete') && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(leaf)}
                                  className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-muted hover:text-red-600 transition-colors"
                                  title="Delete"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      <TagEditModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        editingNode={editingNode}
        allNodes={rawHierarchyNodes}
        onSave={handleSaveNode}
      />

      <SyncReviewModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        currentNodes={rawHierarchyNodes}
        originalNodes={originalRawNodes}
        onConfirm={handleSync}
        syncing={syncing}
        demoMode={useDummyData}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Tag"
        message={`Are you sure you want to delete "${deleteTarget?.Tag ?? ''}"? All references to this tag as ParentTag will be removed, and it will be removed from all GroupTags.`}
        confirmLabel="Delete"
        variant="danger_ghost"
      />

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {lastArchived && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-elevated border border-border shadow-lg rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <span className="text-heading">&quot;{lastArchived.tag}&quot; archived</span>
          <button type="button" onClick={handleUndoArchive} className="text-primary font-medium hover:underline cursor-pointer">
            Undo
          </button>
          <button type="button" onClick={() => setLastArchived(null)} className="text-muted hover:text-heading ml-1 cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
