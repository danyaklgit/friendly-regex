import { useMemo, useState } from 'react';
import type { LOVList, LOVListItem } from '../../types/lov';
import { humanizeLovTag } from '../../utils/humanizeLovTag';
import { Toggle } from '../shared/Toggle';
import { Button } from '../shared/Button';

interface LovItemsPaneProps {
  list: LOVList | null;
  onRefresh: () => void;
  refreshing?: boolean;
}

function isActive(item: LOVListItem): boolean {
  // Backend marks items with explicit ACTIVE/INACTIVE/etc. A null StatusTag is
  // treated as active (mirrors how the Attributes page interprets it).
  return item.StatusTag == null || item.StatusTag === 'ACTIVE';
}

function StatusBadge({ item }: { item: LOVListItem }) {
  const active = isActive(item);
  return (
    <span
      className={`inline-block text-[10px] font-medium rounded-full px-2 py-0.5 border ${
        active
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
      }`}
    >
      {item.StatusName ?? item.StatusTag ?? 'ACTIVE'}
    </span>
  );
}

export function LovItemsPane({ list, onRefresh, refreshing }: LovItemsPaneProps) {
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const items = list?.Items ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!includeInactive && !isActive(item)) return false;
      if (!term) return true;
      return (
        item.Value.toLowerCase().includes(term) ||
        item.Name.toLowerCase().includes(term) ||
        (item.Description ?? '').toLowerCase().includes(term)
      );
    });
  }, [items, search, includeInactive]);

  const inactiveHidden = useMemo(
    () => (includeInactive ? 0 : items.filter((i) => !isActive(i)).length),
    [items, includeInactive],
  );

  if (!list) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-body-secondary py-12">
        Select a category to view its items.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 p-4 gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-heading truncate">{humanizeLovTag(list.Tag)}</h3>
          <p className="text-xs text-muted">
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {inactiveHidden > 0 && (
              <span className="ml-2">· {inactiveHidden} inactive hidden</span>
            )}
          </p>
        </div>
        <Button variant="outline" size="xs" onClick={onRefresh} loading={refreshing}>
          {!refreshing && (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Refresh
        </Button>
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
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>
        <Toggle
          label="Include inactive"
          checked={includeInactive}
          onChange={setIncludeInactive}
        />
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-body-secondary text-sm">
          This list has no items.
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
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Name</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Description</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-body-secondary">Status</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-divide">
              {filtered.map((item) => (
                <tr key={`${list.Tag}-${item.Value}`} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-2.5 text-xs font-mono text-body-secondary">{item.Value}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-heading">{item.Name}</td>
                  <td className="px-4 py-2.5 text-xs text-body-secondary">{item.Description ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs"><StatusBadge item={item} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
