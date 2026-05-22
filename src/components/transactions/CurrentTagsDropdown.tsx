import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DropdownBackdrop } from '../shared/DropdownBackdrop';
import { TagBadge } from './TagBadge';
import type { TagSpecDefinition } from '../../types';

export interface CurrentTagEntry {
  id: string;
  def?: TagSpecDefinition;
}

interface CurrentTagsDropdownProps {
  entries: CurrentTagEntry[];
  selectedIds: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}

// Filter-row pill that opens a searchable multi-select dropdown listing tag
// specs currently matching transactions for the checked-out bank/side. Mirrors
// the visual language of the other filter dropdowns in DynamicFilters.tsx
// (search input + checkbox list + Select all / Deselect all). Selection
// changes are committed immediately; the parent merges the selected IDs into
// activeExtraFilters as an OpsTagSpecDefinitionId IN <ids> filter so the
// backend scopes the transactions fetch.
export function CurrentTagsDropdown({ entries, selectedIds, onChange }: CurrentTagsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 4, left: rect.left });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updatePosition);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      ro?.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      setSearch('');
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const name = e.def?.Tag ?? '';
      return name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
    });
  }, [entries, search]);

  // Split filtered list into Selected (top) / Available (bottom) so the
  // selection state stays scannable in long lists. Matches the StringFromListDropdown
  // convention in DynamicFilters.
  const { selectedFiltered, availableFiltered } = useMemo(() => {
    const sel: CurrentTagEntry[] = [];
    const avail: CurrentTagEntry[] = [];
    for (const e of filtered) (selectedIds.has(e.id) ? sel : avail).push(e);
    return { selectedFiltered: sel, availableFiltered: avail };
  }, [filtered, selectedIds]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const handleSelectAll = () => {
    const next = new Set(selectedIds);
    for (const e of filtered) next.add(e.id);
    onChange(next);
  };

  const handleDeselectAll = () => {
    const next = new Set(selectedIds);
    for (const e of filtered) next.delete(e.id);
    onChange(next);
  };

  const selectedCount = selectedIds.size;
  const hasActive = selectedCount > 0;

  const renderRow = (entry: CurrentTagEntry) => {
    const { id, def } = entry;
    const tagName = def?.Tag ?? '(unknown)';
    const certainty = def?.CertaintyLevelTag ?? 'HIGH';
    const unresolved = !def;
    const isSelected = selectedIds.has(id);
    return (
      <label
        key={id}
        className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer ${
          isSelected ? 'bg-primary/5' : ''
        } hover:bg-surface-hover`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggle(id)}
          className="rounded border-border-strong shrink-0"
        />
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TagBadge tag={tagName} certainty={certainty} />
          {unresolved && (
            <span className="text-[10px] text-muted italic truncate">
              Not in current library
            </span>
          )}
        </div>
      </label>
    );
  };

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Tag specs currently matching transactions in this bank/side"
        className="text-xs px-3 py-1.5 rounded-lg border bg-primary border-primary text-white hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
        </svg>
        Current Tags
        <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-semibold leading-none">
          {hasActive ? `${selectedCount}/${entries.length}` : entries.length}
        </span>
      </button>
      {open && panelPos && createPortal(
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="fixed z-50 bg-surface border border-border rounded-lg shadow-lg min-w-72"
            style={{ top: panelPos.top, left: panelPos.left }}
          >
            <div className="p-2 border-b border-border-subtle">
              <div className="relative">
                <svg
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search tags..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-subtle">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={filtered.length === 0}
                className="cursor-pointer text-[10px] font-medium text-primary-dark hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
              >
                Select all{search.trim() ? ' (matches)' : ''}
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={selectedCount === 0}
                className="cursor-pointer text-[10px] font-medium text-muted hover:text-body hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
              >
                Deselect all{search.trim() ? ' (matches)' : ''}
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto custom-scrollbar p-1.5">
              {filtered.length === 0 ? (
                <div className="px-2 py-3 text-xs text-faint text-center">
                  {entries.length === 0 ? 'No matching tags.' : 'No tags match your search.'}
                </div>
              ) : (
                <>
                  {selectedFiltered.length > 0 && (
                    <>
                      <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                        Selected ({selectedFiltered.length})
                      </div>
                      {selectedFiltered.map(renderRow)}
                      {availableFiltered.length > 0 && (
                        <div className="my-1 border-t border-border-subtle" />
                      )}
                    </>
                  )}
                  {availableFiltered.length > 0 && (
                    <>
                      {selectedFiltered.length > 0 && (
                        <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                          Available
                        </div>
                      )}
                      {availableFiltered.map(renderRow)}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
