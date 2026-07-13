import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DropdownBackdrop } from '../shared/DropdownBackdrop';
import { Tooltip } from '../shared/Tooltip';
import { TagBadge } from './TagBadge';
import { renderTagTooltip } from './TransactionTable';
import type { TagSpecDefinition } from '../../types';

export interface CurrentTagEntry {
  id: string;
  def?: TagSpecDefinition;
  /** Version badge shown on the TagBadge when the same tag name has multiple
   *  definitions in the current library (matches the table's overlay). */
  version?: number;
}

interface CurrentTagsDropdownProps {
  entries: CurrentTagEntry[];
  selectedIds: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** True while `GetAllTransactionTags` is in flight (e.g. just after the
   *  filter-row Refresh button was clicked). Renders the trigger pill as
   *  a skeleton and stubs out the dropdown body so the operator can't
   *  toggle anything against a stale list. */
  loading?: boolean;
  /** When set, the dropdown is "locked" to the given tag-spec definition
   *  id — this is the entry the operator is currently editing in the
   *  Rule Builder. The locked entry is pre-checked and the only row the
   *  operator can interact with; every other row, plus the Select all /
   *  Deselect all controls, are disabled. The trigger pill picks up a
   *  small lock badge so the constraint is visible without opening the
   *  dropdown. */
  lockedToId?: string;
}

// Filter-row pill that opens a searchable multi-select dropdown listing tag
// specs currently matching transactions for the checked-out bank/side. Mirrors
// the visual language of the other filter dropdowns in DynamicFilters.tsx
// (search input + checkbox list + Select all / Deselect all). Selection
// changes are committed immediately; the parent merges the selected IDs into
// activeExtraFilters as an OpsTagSpecDefinitionId IN <ids> filter so the
// backend scopes the transactions fetch.
export function CurrentTagsDropdown({ entries, selectedIds, onChange, loading = false, lockedToId }: CurrentTagsDropdownProps) {
  const isLocked = !!lockedToId;
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

  // Delayed mirror of `selectedIds` used ONLY for the Selected/Available
  // split. The checkbox `checked` state still reads `selectedIds` directly
  // so the tick paints immediately on click; the split lags by 500ms so the
  // operator can see the checkbox flip before the row reflows up to the
  // Selected group. Matches at the moment the dropdown opens (no initial
  // animation) and tracks the latest selection if the user rapid-fires
  // several toggles.
  const [splitSelectedIds, setSplitSelectedIds] = useState<ReadonlySet<string>>(selectedIds);
  useEffect(() => {
    const t = window.setTimeout(() => setSplitSelectedIds(selectedIds), 500);
    return () => window.clearTimeout(t);
  }, [selectedIds]);

  // Split filtered list into Selected (top) / Available (bottom) so the
  // selection state stays scannable in long lists. Matches the StringFromListDropdown
  // convention in DynamicFilters.
  const { selectedFiltered, availableFiltered } = useMemo(() => {
    const sel: CurrentTagEntry[] = [];
    const avail: CurrentTagEntry[] = [];
    for (const e of filtered) (splitSelectedIds.has(e.id) ? sel : avail).push(e);
    return { selectedFiltered: sel, availableFiltered: avail };
  }, [filtered, splitSelectedIds]);

  const toggle = (id: string) => {
    // While locked, the operator can't toggle ANY row — including the
    // locked one itself, since deselecting it would scope away from the
    // tag being edited. The Rule Builder controls that lock; the
    // dropdown only enforces it.
    if (isLocked) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const handleSelectAll = () => {
    if (isLocked) return;
    const next = new Set(selectedIds);
    for (const e of filtered) next.add(e.id);
    onChange(next);
  };

  const handleDeselectAll = () => {
    if (isLocked) return;
    const next = new Set(selectedIds);
    for (const e of filtered) next.delete(e.id);
    onChange(next);
  };

  const selectedCount = selectedIds.size;
  const hasActive = selectedCount > 0;

  const renderRow = (entry: CurrentTagEntry) => {
    const { id, def, version } = entry;
    const tagName = def?.Tag ?? '(unknown)';
    const certainty = def?.CertaintyLevelTag ?? 'HIGH';
    const unresolved = !def;
    const isSelected = selectedIds.has(id);
    // While locked, only the locked entry stays interactive; every other
    // row dims to read-only with its checkbox visually inert.
    const rowDisabled = isLocked && id !== lockedToId;
    // The locked entry itself also can't be toggled (its checkbox is disabled
    // below), so neither it nor the dimmed rows should show a pointer cursor —
    // only genuinely-clickable rows do. The active locked row keeps full
    // opacity (it's the tag being edited), just a non-interactive cursor.
    const rowNonInteractive = rowDisabled || (isLocked && id === lockedToId);
    const row = (
      <label
        key={id}
        title={rowDisabled ? 'Locked to the tag currently open in the Rule Builder' : undefined}
        className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded ${
          rowNonInteractive
            ? `cursor-not-allowed ${rowDisabled ? 'opacity-50' : ''}`
            : 'cursor-pointer hover:bg-surface-hover'
        } ${isSelected ? 'bg-primary/5' : ''}`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggle(id)}
          disabled={rowDisabled || (isLocked && id === lockedToId)}
          aria-label={tagName}
          className={`rounded border-border-strong shrink-0 ${
            rowDisabled || (isLocked && id === lockedToId) ? 'pointer-events-none' : ''
          }`}
        />
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TagBadge tag={tagName} certainty={certainty} version={version} />
          {unresolved && (
            <span className="text-[10px] text-muted italic truncate">
              Not in current library
            </span>
          )}
          {isLocked && id === lockedToId && (
            <span className="text-[9px] uppercase tracking-wider font-semibold text-primary-dark dark:text-primary shrink-0">
              Editing
            </span>
          )}
        </div>
      </label>
    );
    // Mirror the per-row hover content used on tag pills inside transaction
    // rows (renderTagTooltip in TransactionTable). The operator gets the
    // same certainty / rules summary whether they're hovering a badge in
    // the table or a row in this dropdown. `source` is null here — the
    // dropdown lists tag specs by definition only, not by per-row source
    // (OpsTag vs OpsMultiTags); the tooltip suppresses the Source line
    // when null. `versionInfo` is undefined because we only carry the
    // per-row version index, not the library-wide total; rendering the
    // version overlay on the TagBadge itself is enough cue here.
    // `clickable=false` because the dropdown row's primary affordance is
    // the checkbox, not a navigation click. Rows for tag specs not in
    // the current library carry no def so the tooltip would have nothing
    // useful to show — skip it.
    if (!def) return row;
    return (
      <div key={id}>
        <Tooltip
          placement="top"
          content={renderTagTooltip(null, def, false, undefined)}
        >
          {row}
        </Tooltip>
      </div>
    );
  };

  if (loading) {
    return (
      <div
        ref={triggerRef}
        aria-busy="true"
        aria-label="Loading detected tag specs"
        // Skeleton mimics the live pill's footprint so the filter row
        // doesn't reflow when the loading state flips. Same height /
        // border-radius / horizontal padding as the active button.
        className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 animate-pulse min-w-44 select-none"
      >
        <span className="w-3.5 h-3.5 rounded-sm bg-primary/30" />
        <span className="h-3 flex-1 rounded bg-primary/20" />
        <span className="w-6 h-3.5 rounded-full bg-primary/30" />
      </div>
    );
  }

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={isLocked
          ? 'Locked to the tag currently open in the Rule Builder — close the builder to multi-select'
          : 'Tag specs detected on transactions in this bank/side'}
        className="text-xs px-3 py-1.5 rounded-lg border bg-primary border-primary text-white hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
        </svg>
        Detected Tag Specs
        {isLocked && (
          // Properly-centered padlock: body rect + symmetric shackle arc.
          // The previous compound path was visually broken at this size.
          <svg
            className="w-3.5 h-3.5 -mx-0.5 opacity-90"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
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
                  className="w-full pl-7 pr-7 py-1.5 text-xs rounded border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                />
                {/* Clear-search × button. Visible only with a query so
                    the search icon is the only chrome at rest. */}
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      searchInputRef.current?.focus();
                    }}
                    title="Clear search"
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-4 h-4 rounded-full text-muted hover:text-heading hover:bg-surface-active transition-colors cursor-pointer"
                  >
                    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" aria-hidden="true">
                      <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {isLocked && (
              <div className="px-2 py-1.5 border-b border-border-subtle bg-primary/5 text-[10px] text-primary-dark dark:text-primary leading-snug space-y-0.5">
                <div>Scoped to the tag spec you&apos;re editing in the Rule Builder.</div>
                <div>Close the builder to change this selection.</div>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-subtle">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={filtered.length === 0 || isLocked}
                className="cursor-pointer text-[10px] font-medium text-primary-dark hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
              >
                Select all{search.trim() ? ' (matches)' : ''}
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={selectedCount === 0 || isLocked}
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
