import { useMemo, useState } from 'react';
import type { LOVList, LOVListItem } from '../../types/lov';
import type { LOVItemStatus } from '../../api/lovManagement';
import { humanizeLovTag } from '../../utils/humanizeLovTag';
import { downloadCsv } from '../../utils/exportCsv';
import { Button } from '../shared/Button';

/** Item CRUD hooks. Absent = read-only browsing (the wizard drawer, audit role). */
export interface LovItemsManagement {
  onAdd: () => void;
  onEdit: (item: LOVListItem) => void;
  onChangeStatus: (item: LOVListItem, status: LOVItemStatus) => void;
}

interface LovItemsPaneProps {
  list: LOVList | null;
  onRefresh: () => void;
  refreshing?: boolean;
  /** True while the selected list's items are being fetched. */
  loading?: boolean;
  management?: LovItemsManagement;
}

function isDeleted(item: LOVListItem): boolean {
  return item.StatusTag === 'DELETED';
}
function isDisabled(item: LOVListItem): boolean {
  return item.StatusTag === 'DISABLED';
}
/** Arabic display name from the per-language Details (GetLOVListItems only). */
function arabicName(item: LOVListItem): string {
  return item.Details?.find((d) => d.LanguageCode === 'ar')?.Name?.trim() ?? '';
}

export function LovItemsPane({ list, onRefresh, refreshing, loading, management }: LovItemsPaneProps) {
  const [search, setSearch] = useState('');
  // Deleted items are soft-deleted server-side (reads keep returning them);
  // hide them by default with an escape hatch so a duplicate-value rejection
  // on re-add never looks like data corruption.
  const [showDeleted, setShowDeleted] = useState(false);

  const allItems = useMemo(() => list?.Items ?? [], [list]);
  const deletedCount = useMemo(() => allItems.filter(isDeleted).length, [allItems]);
  const items = useMemo(
    () => (showDeleted ? allItems : allItems.filter((it) => !isDeleted(it))),
    [allItems, showDeleted],
  );
  // Arabic names column: shown only when at least one item carries one, so
  // lists without Arabic (or ACTIVE-only fallback payloads without Details)
  // keep the compact single-Name layout.
  const hasArabic = useMemo(() => allItems.some((it) => arabicName(it).length > 0), [allItems]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      return (
        item.Value.toLowerCase().includes(term) ||
        item.Name.toLowerCase().includes(term) ||
        arabicName(item).toLowerCase().includes(term) ||
        (item.Description ?? '').toLowerCase().includes(term) ||
        (item.Tags ?? []).some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [items, search]);

  // Export the items currently in view (honors the search filter) to CSV.
  const handleExport = () => {
    if (!list) return;
    const rows = filtered.map((item) => [
      item.Value,
      item.Name,
      ...(hasArabic ? [arabicName(item)] : []),
      item.Description ?? '',
      (item.Tags ?? []).join('; '),
    ]);
    const headers = ['Value', hasArabic ? 'Name (en)' : 'Name', ...(hasArabic ? ['Name (ar)'] : []), 'Description', 'Tags'];
    downloadCsv(`lov_${list.Tag}_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  if (!list) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-body-secondary py-12">
        {loading ? 'Loading items…' : 'Select a category to view its items.'}
      </div>
    );
  }

  const canManage = !!management;
  const iconBtn = 'p-1 rounded text-faint hover:text-body hover:bg-surface-hover disabled:opacity-40';

  return (
    <div data-tour="lov-items-pane" className="flex-1 flex flex-col min-w-0 p-4 gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-heading truncate">{list.Name?.trim() || humanizeLovTag(list.Tag)}</h3>
          <p className="text-xs text-muted">
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {deletedCount > 0 && !showDeleted && ` · ${deletedCount} deleted hidden`}
            <span className="ml-2 font-mono text-[10px] text-faint">{list.Tag}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canManage && (
            <Button variant="primary" size="xs" onClick={management.onAdd} title="Add an item to this list">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add item
            </Button>
          )}
          <Button variant="outline" size="xs" onClick={handleExport} disabled={filtered.length === 0} title="Export the listed items to CSV">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export
          </Button>
          <Button variant="outline" size="xs" onClick={onRefresh} loading={refreshing}>
            {!refreshing && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search items by value, name, description, or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>
        {canManage && deletedCount > 0 && (
          <label className="inline-flex items-center gap-1.5 text-xs text-body-secondary cursor-pointer select-none">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="rounded border-border-strong" />
            Show deleted ({deletedCount})
          </label>
        )}
      </div>

      {loading && allItems.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">Loading items…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">
          {allItems.length === 0 ? 'This list has no items.' : 'Every item in this list is deleted.'}
          {canManage && allItems.length === 0 && (
            <div className="mt-3">
              <Button variant="outline" size="xs" onClick={management.onAdd}>Add the first item</Button>
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">
          No items match your search.
        </div>
      ) : (
        <div className="overflow-auto custom-scrollbar border border-border rounded-lg flex-1 min-h-0">
          <table className="min-w-full divide-y divide-divide">
            <thead className="bg-surface-secondary sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Value</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">{hasArabic ? 'Name (en)' : 'Name'}</th>
                {hasArabic && (
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Name (ar)</th>
                )}
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Description</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Tags</th>
                {canManage && (
                  <>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Status</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-divide">
              {filtered.map((item, i) => {
                const tags = item.Tags ?? [];
                const deleted = isDeleted(item);
                const disabled = isDisabled(item);
                const hasId = item.Id != null;
                return (
                  <tr key={`${list.Tag}-${item.Id ?? item.Value}-${i}`} className={`hover:bg-surface-hover transition-colors ${deleted ? 'opacity-55' : ''}`}>
                    <td className={`px-4 py-2.5 text-xs font-mono text-body-secondary ${deleted ? 'line-through' : ''}`}>{item.Value}</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-heading">{item.Name}</td>
                    {hasArabic && (
                      <td className="px-4 py-2.5 text-xs font-medium text-heading" dir="auto">
                        {arabicName(item) || <span className="text-faint">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-xs text-body-secondary">{item.Description ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {tags.length === 0 ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-block text-[10px] font-medium bg-surface-secondary border border-border rounded-full px-2 py-0.5 text-body-secondary"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {canManage && (
                      <>
                        <td className="px-4 py-2.5 text-xs">
                          {deleted ? (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800">Deleted</span>
                          ) : disabled ? (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-amber-200 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">Disabled</span>
                          ) : (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <div className="flex items-center justify-end gap-0.5" title={hasId ? undefined : 'This item has no id — reload after the backend deploy'}>
                            <button className={iconBtn} disabled={!hasId || deleted} onClick={() => management.onEdit(item)} title="Edit" aria-label={`Edit ${item.Value}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                              </svg>
                            </button>
                            {deleted ? (
                              <button className={iconBtn} disabled={!hasId} onClick={() => management.onChangeStatus(item, 'ACTIVE')} title="Restore" aria-label={`Restore ${item.Value}`}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                                </svg>
                              </button>
                            ) : disabled ? (
                              <button className={iconBtn} disabled={!hasId} onClick={() => management.onChangeStatus(item, 'ACTIVE')} title="Enable" aria-label={`Enable ${item.Value}`}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                </svg>
                              </button>
                            ) : (
                              <button className={iconBtn} disabled={!hasId} onClick={() => management.onChangeStatus(item, 'DISABLED')} title="Disable" aria-label={`Disable ${item.Value}`}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </button>
                            )}
                            {!deleted && (
                              <button className={`${iconBtn} hover:text-red-600`} disabled={!hasId} onClick={() => management.onChangeStatus(item, 'DELETED')} title="Delete" aria-label={`Delete ${item.Value}`}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
