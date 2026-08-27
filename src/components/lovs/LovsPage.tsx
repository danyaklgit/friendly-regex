import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import type { TepHeaders } from '../../api/transactions';
import { getListsByTags } from '../../api/lovAttributes';
import {
  getLOVLists,
  createLOVList,
  createLOVListItem,
  updateLOVListItem,
  changeLOVListItemStatus,
  type LOVItemStatus,
} from '../../api/lovManagement';
import type { LOVList, LOVListItem, LOVCatalogEntry, AttributeDetail } from '../../types/lov';
import { LOV_TAGS } from '../../constants/lov';
import { LovCategoryList, type LovCategoryLike } from './LovCategoryList';
import { LovItemsPane, type LovItemsManagement } from './LovItemsPane';
import { LovItemFormModal, type LovItemFormPayload } from './LovItemFormModal';
import { NewLovListModal } from './NewLovListModal';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Toast } from '../shared/Toast';

// Fallback-only hidden set, used when the catalog endpoint is unavailable
// (pre-deploy backend) and the sidebar has to be derived from the wizard's
// LOV_TAGS fetch. GetLOVLists never returns ATTRIBUTES / EXTRACTIONS /
// DEMO_USER_COMPS, and ATTRIBUTE_TRANSFORMATON is meant to be visible and
// manageable now — it only stays hidden in the degraded, read-only mode.
const FALLBACK_HIDDEN_LOV_TAGS = new Set(['ATTRIBUTES', 'ATTRIBUTE_TRANSFORMATON', 'EXTRACTIONS', 'DEMO_USER_COMPS']);

const WIZARD_TAGS = new Set<string>(LOV_TAGS);

/**
 * Settings → LOVs. The sidebar is driven by the manageable-lists catalog
 * (`GetLOVLists`) so operator-created lists appear with no front-end build;
 * the selected list's items load via a targeted `GetListsByTags`. Item CRUD
 * + New list are hidden for the audit role. Writes to a list the wizard
 * consumes (LOV_TAGS) also refresh LovAttributesContext so pickers update.
 */
export function LovsPage() {
  const { lovLists, lovLoading, refetchAll } = useLovAttributes();
  const { isAudit, getAuthHeaders, refreshIfNeeded, userId } = useAuth();
  const tepConfig = useTepConfig();

  const tepHeaders = useMemo<TepHeaders | null>(() => {
    if (!userId) return null;
    return {
      userId,
      tenantCode: tepConfig.ttpTenantCode,
      languageCode: tepConfig.languageCode,
      timeZone: tepConfig.timeZone,
      requestId: tepConfig.ttpRequestId,
    };
  }, [userId, tepConfig]);

  const getToken = useCallback(async (): Promise<string> => {
    await refreshIfNeeded();
    const auth = getAuthHeaders().Authorization ?? '';
    return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  }, [getAuthHeaders, refreshIfNeeded]);

  // --- Catalog ---------------------------------------------------------------
  const [catalog, setCatalog] = useState<LOVCatalogEntry[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  // null = the catalog endpoint isn't available (backend not deployed yet):
  // degrade to the wizard's lists, read-only.
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);

  const loadCatalog = useCallback(async () => {
    if (!tepHeaders) return;
    setCatalogLoading(true);
    try {
      const token = await getToken();
      const lists = await getLOVLists(token, tepHeaders);
      setCatalog(lists);
      setCatalogUnavailable(false);
    } catch {
      setCatalog(null);
      setCatalogUnavailable(true);
    } finally {
      setCatalogLoading(false);
    }
  }, [tepHeaders, getToken]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const sidebarLists = useMemo<LovCategoryLike[]>(() => {
    if (catalog) return catalog;
    return lovLists.filter((l) => !FALLBACK_HIDDEN_LOV_TAGS.has(l.Tag));
  }, [catalog, lovLists]);

  // --- Selection + items -----------------------------------------------------
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  useEffect(() => {
    if (sidebarLists.length === 0) {
      if (selectedTag !== null) setSelectedTag(null);
      return;
    }
    if (!selectedTag || !sidebarLists.some((l) => l.Tag === selectedTag)) {
      setSelectedTag(sidebarLists[0].Tag);
    }
  }, [sidebarLists, selectedTag]);

  const [selectedList, setSelectedList] = useState<LOVList | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const itemsAbortRef = useRef<AbortController | null>(null);

  const loadItems = useCallback(async (tag: string) => {
    if (!tepHeaders) return;
    itemsAbortRef.current?.abort();
    const controller = new AbortController();
    itemsAbortRef.current = controller;
    setItemsLoading(true);
    try {
      const token = await getToken();
      const lists = await getListsByTags(token, tepHeaders, controller.signal, [tag]);
      if (controller.signal.aborted) return;
      const list = lists.find((l) => l.Tag === tag) ?? null;
      setSelectedList(list ?? { Tag: tag, Name: sidebarLists.find((l) => l.Tag === tag)?.Name ?? tag, Items: [] });
    } catch (err) {
      if (controller.signal.aborted) return;
      // Fall back to whatever the wizard context already holds for this tag.
      setSelectedList(lovLists.find((l) => l.Tag === tag) ?? null);
      setToast({ message: err instanceof Error ? err.message : 'Failed to load items', type: 'error' });
    } finally {
      if (!controller.signal.aborted) setItemsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tepHeaders, getToken]);

  useEffect(() => {
    if (!selectedTag) { setSelectedList(null); return; }
    void loadItems(selectedTag);
  }, [selectedTag, loadItems]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadCatalog(), selectedTag ? loadItems(selectedTag) : Promise.resolve()]);
    } finally {
      setRefreshing(false);
    }
  };

  /** After any write: reload the list + catalog counts; refresh the wizard
   *  context when the list is one the wizard consumes. */
  const afterWrite = useCallback(async (tag: string) => {
    await Promise.all([loadItems(tag), loadCatalog()]);
    if (WIZARD_TAGS.has(tag)) void refetchAll();
  }, [loadItems, loadCatalog, refetchAll]);

  // --- Mutations -------------------------------------------------------------
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LOVListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LOVListItem | null>(null);
  const [newListOpen, setNewListOpen] = useState(false);

  const canManage = !isAudit && !catalogUnavailable && !!tepHeaders;

  const handleSaveItem = useCallback(async (payload: LovItemFormPayload) => {
    if (!selectedTag || !tepHeaders) return;
    const token = await getToken();
    const sfm = payload.Id != null
      ? await updateLOVListItem({ ListTag: selectedTag, Id: payload.Id, Value: payload.Value, Tags: payload.Tags ?? null, Details: payload.Details }, token, tepHeaders)
      : await createLOVListItem({ ListTag: selectedTag, Value: payload.Value, ...(payload.Tags ? { Tags: payload.Tags } : {}), Details: payload.Details }, token, tepHeaders);
    setToast({ message: sfm ?? (payload.Id != null ? 'Item updated' : 'Item added'), type: 'success' });
    await afterWrite(selectedTag);
  }, [selectedTag, tepHeaders, getToken, afterWrite]);

  const changeStatus = useCallback(async (item: LOVListItem, status: LOVItemStatus) => {
    if (!selectedTag || !tepHeaders || item.Id == null) return;
    try {
      const token = await getToken();
      const sfm = await changeLOVListItemStatus({ ListTag: selectedTag, Id: item.Id, StatusTag: status }, token, tepHeaders);
      const verb = status === 'ACTIVE' ? 'enabled' : status === 'DISABLED' ? 'disabled' : 'deleted';
      setToast({ message: sfm ?? `Item ${verb}`, type: 'success' });
      await afterWrite(selectedTag);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Status change failed', type: 'error' });
    }
  }, [selectedTag, tepHeaders, getToken, afterWrite]);

  const management = useMemo<LovItemsManagement | undefined>(() => {
    if (!canManage) return undefined;
    return {
      onAdd: () => { setEditTarget(null); setItemFormOpen(true); },
      onEdit: (item) => { setEditTarget(item); setItemFormOpen(true); },
      onChangeStatus: (item, status) => {
        if (status === 'DELETED') setDeleteTarget(item);
        else void changeStatus(item, status);
      },
    };
  }, [canManage, changeStatus]);

  const handleCreateList = useCallback(async (payload: { Tag: string; Details: AttributeDetail[] }) => {
    if (!tepHeaders) return;
    const token = await getToken();
    const sfm = await createLOVList(payload, token, tepHeaders);
    setToast({ message: sfm ?? `List ${payload.Tag} created`, type: 'success' });
    await loadCatalog();
    setSelectedTag(payload.Tag);
  }, [tepHeaders, getToken, loadCatalog]);

  // --- Render ----------------------------------------------------------------
  const initialLoading = (catalogLoading && catalog === null && !catalogUnavailable) || (catalogUnavailable && lovLoading && lovLists.length === 0);
  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-body-secondary">
        Loading lists…
      </div>
    );
  }

  if (sidebarLists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-body-secondary">
        No LOV categories available.
        {canManage && (
          <button type="button" onClick={() => setNewListOpen(true)} className="text-primary hover:underline text-xs">
            Create the first list
          </button>
        )}
      </div>
    );
  }

  const selectedName = selectedList?.Name?.trim() || sidebarLists.find((l) => l.Tag === selectedTag)?.Name || selectedTag || '';

  return (
    <div className="flex h-full -m-4" data-tour="lovs-page">
      <LovCategoryList
        lists={sidebarLists}
        selectedTag={selectedTag}
        onSelect={setSelectedTag}
        onNewList={canManage ? () => setNewListOpen(true) : undefined}
      />
      <LovItemsPane
        list={selectedList}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        loading={itemsLoading}
        management={management}
      />

      {selectedTag && (
        <LovItemFormModal
          open={itemFormOpen}
          onClose={() => { setItemFormOpen(false); setEditTarget(null); }}
          listTag={selectedTag}
          listName={selectedName}
          item={editTarget}
          existingItems={selectedList?.Items ?? []}
          onSave={handleSaveItem}
        />
      )}
      <NewLovListModal
        open={newListOpen}
        onClose={() => setNewListOpen(false)}
        existingTags={sidebarLists.map((l) => l.Tag)}
        onCreate={handleCreateList}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void changeStatus(target, 'DELETED');
        }}
        title="Delete item"
        message={deleteTarget ? `Delete "${deleteTarget.Value}" (${deleteTarget.Name}) from ${selectedName}? Rules that resolve this value will stop matching it.` : ''}
        confirmLabel="Delete"
        variant="danger"
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
