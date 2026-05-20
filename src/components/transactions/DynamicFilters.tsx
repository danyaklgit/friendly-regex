import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AnalyzedTransaction, TagSpecDefinition } from '../../types';
import type { FieldMeta } from '../../utils/deriveFieldMeta';
import type { FilterDefinition } from '../../api/transactions';
import { Button } from '../shared/Button';
import { DropdownBackdrop } from '../shared/DropdownBackdrop';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

type FilterState = Record<string, Set<string>>;

const FILTER_EXCLUSIONS = new Set([
  'AdditionalInformation',
  'TransactionDetails',
  'Description1',
  'Description2',
]);

/** API filter tags that should not render as filter dropdowns in live mode */
const HIDDEN_API_FILTER_TAGS = new Set([
  'IsDeadEnd',
  'IsUntagged',
  'IsMultiTagged',
  'OpsAttributes',
]);

interface DynamicFiltersProps {
  data: AnalyzedTransaction[];
  fieldMeta: FieldMeta;
  tagDefinitions: TagSpecDefinition[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  showOnlyUntagged: boolean;
  onShowOnlyUntaggedChange: (value: boolean) => void;
  showOnlyMultiTagged: boolean;
  onShowOnlyMultiTaggedChange: (value: boolean) => void;
  showOnlyDeadEnd: boolean;
  onShowOnlyDeadEndChange: (value: boolean) => void;
  baseFilters?: FilterState;
  endSlot?: ReactNode;
  isLiveMode?: boolean;
  filterDefinitions?: FilterDefinition[];
  filterDefinitionsLoading?: boolean;
  decimalMaxValues?: Map<string, number>;
  disabledFilterTags?: Set<string>;
}

// ─── Shared dropdown hook ─────────────────────────────────────────────────────

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return { open, setOpen, ref };
}

// ─── Dual-thumb range slider ──────────────────────────────────────────────────

function RangeSlider({
  min,
  max,
  low,
  high,
  step,
  onLowChange,
  onHighChange,
  hideLabels,
}: {
  min: number;
  max: number;
  low: number;
  high: number;
  step?: number;
  onLowChange: (v: number) => void;
  onHighChange: (v: number) => void;
  hideLabels?: boolean;
}) {
  const range = max - min || 1;
  const lowPct = ((low - min) / range) * 100;
  const highPct = ((high - min) / range) * 100;
  const stepVal = step ?? 'any';

  return (
    <div className="px-2 pt-1 pb-2">
      {!hideLabels && (
        <div className="flex items-center justify-between text-[10px] text-muted mb-1">
          <span>{low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span>{high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )}
      <div className="relative h-4">
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-surface-tertiary rounded" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 bg-primary rounded"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={stepVal}
          value={low}
          onChange={(e) => {
            const v = Number(e.target.value);
            onLowChange(Math.min(v, high));
          }}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={stepVal}
          value={high}
          onChange={(e) => {
            const v = Number(e.target.value);
            onHighChange(Math.max(v, low));
          }}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>
  );
}

// ─── LIST + EQ filter (Show Only) ─────────────────────────────────────────────

function ListEqDropdown({
  definition,
  filters,
  onFiltersChange,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  const key = definition.Tag;
  const selected = filters[key] ?? new Set<string>();
  const activeLabels = definition.Values.filter((v) => selected.has(v.Column)).map((v) => v.Label);
  const hasActive = activeLabels.length > 0;

  // Reverse index: for each target column T, the columns whose DisabledBy
  // points at T. Used to make the mutual-exclusion symmetric — if value A
  // declares DisabledBy: Column:B, then selecting A must also disable B (not
  // just the other way around).
  const reverseDisablers = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const v of definition.Values) {
      if (!v.DisabledBy) continue;
      const match = v.DisabledBy.match(/^Column:(.+)$/);
      if (!match) continue;
      const target = match[1];
      if (!map.has(target)) map.set(target, new Set());
      map.get(target)!.add(v.Column);
    }
    return map;
  }, [definition.Values]);

  // DisabledBy logic from API: format "Column:<columnName>". Applied
  // symmetrically — a value is disabled when either (a) its DisabledBy points
  // at a selected column, or (b) any selected column declares it as its
  // DisabledBy target.
  const isDisabled = (v: typeof definition.Values[number]) => {
    if (v.DisabledBy) {
      const match = v.DisabledBy.match(/^Column:(.+)$/);
      if (match && selected.has(match[1])) return true;
    }
    const disablers = reverseDisablers.get(v.Column);
    if (disablers) {
      for (const d of disablers) {
        if (selected.has(d)) return true;
      }
    }
    return false;
  };

  const handleToggle = (column: string) => {
    const next = new Set(selected);
    if (next.has(column)) {
      next.delete(column);
    } else {
      next.add(column);
      // Remove any selected values that become disabled by this new selection
      for (const v of definition.Values) {
        if (v.Column === column) continue;
        if (!v.DisabledBy) continue;
        const match = v.DisabledBy.match(/^Column:(.+)$/);
        if (match && match[1] === column) next.delete(v.Column);
      }
      // Reverse: if the newly selected value declares a DisabledBy target,
      // drop the target from the selection too (handles inconsistent state
      // such as filters restored from a share link).
      const clicked = definition.Values.find((vv) => vv.Column === column);
      if (clicked?.DisabledBy) {
        const match = clicked.DisabledBy.match(/^Column:(.+)$/);
        if (match) next.delete(match[1]);
      }
    }

    const updated = { ...filters };
    if (next.size === 0) delete updated[key];
    else updated[key] = next;
    onFiltersChange(updated);
  };

  // Split the list into a "Selected" group at the top and an "Available"
  // group below, preserving the definition's original order within each
  // group. Items move between groups only on user toggle, so the list never
  // shifts under the cursor unexpectedly.
  const { selectedValues, availableValues } = useMemo(() => {
    const sel: typeof definition.Values = [];
    const avail: typeof definition.Values = [];
    for (const v of definition.Values) {
      (selected.has(v.Column) ? sel : avail).push(v);
    }
    return { selectedValues: sel, availableValues: avail };
  }, [definition.Values, selected]);

  const handleSelectAll = () => {
    const next = new Set<string>();
    for (const v of definition.Values) {
      if (!isDisabled(v)) next.add(v.Column);
    }
    const updated = { ...filters };
    if (next.size === 0) delete updated[key];
    else updated[key] = next;
    onFiltersChange(updated);
  };
  const handleDeselectAll = () => {
    const updated = { ...filters };
    delete updated[key];
    onFiltersChange(updated);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        data-filter-tag={definition.Tag}
        data-filter-label={definition.Label}
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
          hasActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {hasActive ? `Show: ${activeLabels.join(' & ')}` : definition.Label}
      </button>
      {open && panelPos && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          {createPortal(
            <div
              ref={panelRef}
              className="fixed z-50 bg-surface border border-border rounded-lg shadow-lg min-w-64"
              style={{ top: panelPos.top, left: panelPos.left }}
            >
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-subtle">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="cursor-pointer text-[10px] font-medium text-primary-dark hover:underline"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="cursor-pointer text-[10px] font-medium text-muted hover:text-body hover:underline"
                >
                  Deselect all
                </button>
              </div>
              <div className="p-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                {selectedValues.length > 0 && (
                  <>
                    <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                      Selected ({selectedValues.length})
                    </div>
                    {selectedValues.map((v) => (
                      <label
                        key={v.Column}
                        className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded text-black dark:text-white ${
                          isDisabled(v)
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-surface-hover cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isDisabled(v)}
                          checked
                          onChange={() => handleToggle(v.Column)}
                          className="rounded border-border-strong"
                        />
                        <span>{v.Label}</span>
                      </label>
                    ))}
                    {availableValues.length > 0 && (
                      <div className="my-1 border-t border-border-subtle" />
                    )}
                  </>
                )}
                {availableValues.length > 0 && (
                  <>
                    {selectedValues.length > 0 && (
                      <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                        Available
                      </div>
                    )}
                    {availableValues.map((v) => (
                      <label
                        key={v.Column}
                        className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded text-black dark:text-white ${
                          isDisabled(v)
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-surface-hover cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isDisabled(v)}
                          checked={false}
                          onChange={() => handleToggle(v.Column)}
                          className="rounded border-border-strong"
                        />
                        <span>{v.Label}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}

// ─── STRING-FROM-LIST filter ──────────────────────────────────────────────────

function StringFromListDropdown({
  definition,
  filters,
  onFiltersChange,
  locked,
  disabled,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  locked?: boolean;
  disabled?: boolean;
}) {
  const { open, setOpen, ref } = useDropdown();
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const key = definition.Tag;
  const selected = filters[key] ?? new Set<string>();
  const hasActive = selected.size > 0;
  const isSearchable = definition.IsFilterSearchable === true;

  useEffect(() => {
    if (open && isSearchable) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
    if (!open) setSearch('');
  }, [open, isSearchable]);

  // Render filter values in the exact order the backend returns them — no
  // front-end sorting.
  const filteredValues = useMemo(() => {
    if (!search.trim()) return definition.Values;
    const term = search.toLowerCase();
    return definition.Values.filter(
      (v) => (v.Label ?? v.Value ?? '').toLowerCase().includes(term) ||
             (v.Value ?? '').toLowerCase().includes(term) ||
             (v.SubLabel ?? '').toLowerCase().includes(term)
    );
  }, [definition.Values, search]);

  // Split the filtered list into a "Selected" group at the top and an
  // "Available" group below. Items move between groups only when the user
  // toggles their checkbox, so the list never shifts under the cursor in the
  // middle of selecting adjacent rows. Keyboard navigation walks Selected
  // first, then Available — matching the visual order.
  const { selectedFiltered, availableFiltered, navigableValues } = useMemo(() => {
    const sel: typeof filteredValues = [];
    const avail: typeof filteredValues = [];
    for (const v of filteredValues) {
      (selected.has(v.Value ?? '') ? sel : avail).push(v);
    }
    return { selectedFiltered: sel, availableFiltered: avail, navigableValues: [...sel, ...avail] };
  }, [filteredValues, selected]);

  const handleToggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);

    const updated = { ...filters };
    if (next.size === 0) delete updated[key];
    else updated[key] = next;
    onFiltersChange(updated);
  };

  // Select/Deselect all act on the CURRENT filtered view — so when the user
  // has typed a search term, Select all only adds the matching values rather
  // than wiping in 10 000 unrelated entries. With no search, it picks every
  // value in the definition.
  const handleSelectAll = () => {
    const next = new Set(selected);
    for (const v of filteredValues) {
      if (v.Value != null) next.add(v.Value);
    }
    const updated = { ...filters };
    if (next.size === 0) delete updated[key];
    else updated[key] = next;
    onFiltersChange(updated);
  };
  const handleDeselectAll = () => {
    if (!search.trim()) {
      // No search → clear the filter entirely.
      const updated = { ...filters };
      delete updated[key];
      onFiltersChange(updated);
      return;
    }
    // Searching → only remove the currently-visible matches; leave other
    // selections untouched.
    const next = new Set(selected);
    for (const v of filteredValues) {
      if (v.Value != null) next.delete(v.Value);
    }
    const updated = { ...filters };
    if (next.size === 0) delete updated[key];
    else updated[key] = next;
    onFiltersChange(updated);
  };

  // Reset the cursor whenever the list changes (search input or open state).
  useEffect(() => { setHighlightIndex(0); }, [search, open]);

  // Keep the highlighted row scrolled into view as the user arrows through.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-opt-index="${highlightIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, open]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (navigableValues.length === 0 ? 0 : Math.min(i + 1, navigableValues.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const v = navigableValues[highlightIndex];
      if (v) handleToggle(v.Value ?? '');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (locked && hasActive) {
    const lockedLabels = definition.Values
      .filter((v) => selected.has(v.Value ?? ''))
      .map((v) => v.Label);
    return (
      <div className="text-xs px-3 py-1.5 rounded-lg border border-border bg-surface-tertiary text-muted cursor-not-allowed flex items-center gap-1.5">
        <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        {definition.Label}: {lockedLabels.join(', ')}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        data-filter-tag={definition.Tag}
        data-filter-label={definition.Label}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          disabled
            ? 'bg-primary/10 border-primary/30 text-primary-dark opacity-60 cursor-not-allowed'
            : hasActive
              ? 'bg-primary/10 border-primary/30 text-primary-dark'
              : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {definition.Label}
      </button>
      {open && !disabled && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-64">
            {isSearchable && (
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
                    placeholder={`Search ${definition.Label.toLowerCase()}...`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-subtle">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={filteredValues.length === 0}
                className="cursor-pointer text-[10px] font-medium text-primary-dark hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
              >
                Select all{search.trim() ? ' (matches)' : ''}
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={selected.size === 0}
                className="cursor-pointer text-[10px] font-medium text-muted hover:text-body hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
              >
                Deselect all{search.trim() ? ' (matches)' : ''}
              </button>
            </div>
            <div ref={listRef} className="max-h-60 overflow-y-auto custom-scrollbar p-1.5">
              {filteredValues.length === 0 ? (
                <div className="px-2 py-3 text-xs text-faint text-center">No matches</div>
              ) : (() => {
                const renderRow = (v: typeof filteredValues[number], idx: number) => {
                  const isSelected = selected.has(v.Value ?? '');
                  const isHighlighted = idx === highlightIndex;
                  const baseBg = isSelected ? 'bg-primary/5' : '';
                  const hoverBg = isHighlighted
                    ? (isSelected ? 'bg-primary/15' : 'bg-primary/10')
                    : 'hover:bg-surface-hover';
                  return (
                    <label
                      key={v.Value}
                      data-opt-index={idx}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      className={`flex items-start gap-2 px-2 py-1.5 text-xs rounded cursor-pointer ${baseBg} ${hoverBg}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(v.Value ?? '')}
                        className="rounded border-border-strong shrink-0 mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-black dark:text-white font-medium truncate">{v.Label || v.Value}</span>
                        {v.SubLabel && <span className="block text-[10px] text-muted truncate">{v.SubLabel}</span>}
                      </span>
                    </label>
                  );
                };
                return (
                  <>
                    {selectedFiltered.length > 0 && (
                      <>
                        <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                          Selected ({selectedFiltered.length})
                        </div>
                        {selectedFiltered.map((v, i) => renderRow(v, i))}
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
                        {availableFiltered.map((v, i) => renderRow(v, selectedFiltered.length + i))}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── SEARCH filter ────────────────────────────────────────────────────────────

function SearchFilter({
  definition,
  filters,
  onFiltersChange,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const key = definition.Tag;
  const currentValue = [...(filters[key] ?? [])][0] ?? '';
  const [inputValue, setInputValue] = useState(currentValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setInputValue(currentValue);
  }, [currentValue]);

  const handleChange = (text: string) => {
    setInputValue(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = { ...filters };
      if (text.trim()) {
        next[key] = new Set([text.trim()]);
      } else {
        delete next[key];
      }
      onFiltersChange(next);
    }, 400);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={definition.Label}
        className={`text-xs pl-3 ${currentValue ? 'pr-7' : 'pr-3'} py-1.5 rounded-lg border transition-colors w-40 outline-none ${
          currentValue
            ? 'bg-primary/10 border-primary/30 text-primary-dark placeholder:text-primary-dark/50'
            : 'bg-surface border-border-strong text-body placeholder:text-muted hover:bg-surface-hover'
        }`}
      />
      {currentValue && (
        <button
          onClick={() => handleChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-body text-xs"
        >
          &times;
        </button>
      )}
    </div>
  );
}

// Round n up to the nearest "nice" number (2 significant digits of rounding unit).
// e.g. 214,630,287 → 215,000,000 | 30,082 → 30,100 | 351,739 → 352,000
function ceilToNice(n: number): number {
  if (n <= 0) return 0;
  const magnitude = Math.floor(Math.log10(n));
  const step = Math.pow(10, Math.max(0, magnitude - 2));
  return Math.ceil(n / step) * step;
}

// Format a numeric string with thousand separators, preserving trailing decimal point/digits.
function formatThousands(raw: string): string {
  if (!raw) return raw;
  const [intPart, ...decParts] = raw.split('.');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decParts.length > 0 ? `${formatted}.${decParts.join('.')}` : formatted;
}

// ─── DECIMAL filter (range slider) ───────────────────────────────────────────

// Static default ceiling for decimal range sliders. We no longer probe the API
// for a true global max (see TransactionsTab) — instead the slider opens at
// this value and edit mode lets the user type a higher number if their data
// exceeds it.
const DEFAULT_DECIMAL_MAX = 200_000_000;

function DecimalFilter({
  definition,
  filters,
  onFiltersChange,
  dataMax,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  dataMax?: number;
}) {
  const { open, setOpen, ref } = useDropdown();
  const gteKey = `${definition.Tag}_GTE`;
  const lteKey = `${definition.Tag}_LTE`;
  const currentMin = [...(filters[gteKey] ?? [])][0] ?? '';
  const currentMax = [...(filters[lteKey] ?? [])][0] ?? '';
  const hasActive = !!currentMin || !!currentMax;

  // Base ceiling: the static default is the floor, growing if the loaded data
  // actually exceeds it. The slider is always usable — no "No data available"
  // state — so hasSlider is always true once we render this component.
  const dataDerivedMax = dataMax !== undefined && dataMax > 0 ? ceilToNice(dataMax) : 0;
  const baseMax = Math.max(DEFAULT_DECIMAL_MAX, dataDerivedMax);

  // Applied filter values (what's actually filtering the table)
  const appliedLow = currentMin !== '' ? Number(currentMin) : 0;
  const appliedHigh = currentMax !== '' ? Number(currentMax) : baseMax;

  // Pending (draft) slider state — not applied until user clicks Filter
  const [pendingLow, setPendingLow] = useState(appliedLow);
  const [pendingHigh, setPendingHigh] = useState(appliedHigh);

  // Grow sliderMax so the thumb stays in range if the user (or a saved filter)
  // exceeds the default. Lets edit-mode entries beyond DEFAULT_DECIMAL_MAX work
  // without truncating the slider visually.
  const sliderMax = Math.max(baseMax, appliedHigh, pendingHigh);
  const hasSlider = sliderMax > 0;
  // Step proportional to max, capped at 500,000
  const step = Math.min(500_000, Math.max(1, Math.pow(10, Math.max(0, Math.floor(Math.log10(sliderMax)) - 2))));

  // Edit-mode state for manual min/max inputs
  const [editMode, setEditMode] = useState(false);
  const [lowStr, setLowStr] = useState('');
  const [highStr, setHighStr] = useState('');

  // Sync pending state when the panel opens or applied values change externally
  useEffect(() => {
    setPendingLow(appliedLow);
    setPendingHigh(appliedHigh);
    setEditMode(false);
  }, [open, appliedLow, appliedHigh]);

  const isDirty = pendingLow !== appliedLow || pendingHigh !== appliedHigh;

  const applyFilter = () => {
    const next = { ...filters };
    if (pendingLow <= 0) delete next[gteKey];
    else next[gteKey] = new Set([String(pendingLow)]);
    // Always honor pendingHigh as the upper bound — the user reached this
    // value deliberately (Apply only fires when isDirty, and the Apply button
    // only renders then). Even if they typed a value above the static 200M
    // default, that ceiling is just a starting point, not a cap. Reset
    // clears the filter via clearFilter().
    if (pendingHigh > 0 && pendingHigh >= pendingLow) next[lteKey] = new Set([String(pendingHigh)]);
    else delete next[lteKey];
    onFiltersChange(next);
    setOpen(false);
  };

  const clearFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingLow(0);
    setPendingHigh(baseMax);
    const next = { ...filters };
    delete next[gteKey];
    delete next[lteKey];
    onFiltersChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
          hasActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {definition.Label}
        {hasActive && (
          <>
            <span className="opacity-70">({Number(currentMin || 0).toLocaleString()} – {Number(currentMax || sliderMax).toLocaleString()})</span>
            <span onClick={clearFilter} className="ml-0.5 opacity-60 hover:opacity-100">&times;</span>
          </>
        )}
      </button>
      {open && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-80 overflow-hidden">
            <div className="px-3 pt-2 pb-1 border-b border-border-subtle flex items-center justify-between">
              <span className="text-[10px] text-muted font-medium uppercase tracking-wide">{definition.Label}</span>
              <div className="flex items-center gap-2">
                {hasSlider && (
                  <button
                    onClick={() => {
                      if (editMode) {
                        setEditMode(false);
                      } else {
                        setLowStr(formatThousands(String(pendingLow)));
                        setHighStr(formatThousands(String(pendingHigh)));
                        setEditMode(true);
                      }
                    }}
                    className="flex items-center gap-1 text-[10px] text-muted hover:text-body transition-colors cursor-pointer"
                  >
                    {editMode ? (
                      'Done'
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                        </svg>
                        <span>Edit</span>
                      </>
                    )}
                  </button>
                )}
                {hasActive && (
                  <>
                    <span className="text-border-strong">|</span>
                    <button onClick={clearFilter} className="text-[10px] text-muted hover:text-body transition-colors cursor-pointer">
                      Reset
                    </button>
                  </>
                )}
              </div>
            </div>
            {hasSlider ? (
              <>
                {editMode && (
                  <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                    <input
                      type="text"
                      value={lowStr}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '');
                        setLowStr(formatThousands(raw));
                        const v = parseFloat(raw);
                        if (!isNaN(v) && v >= 0 && v <= pendingHigh) {
                          setPendingLow(v);
                        }
                      }}
                      className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body focus:outline-none focus:border-primary"
                      placeholder="Min"
                    />
                    <span className="text-xs text-muted shrink-0">–</span>
                    <input
                      type="text"
                      value={highStr}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '');
                        setHighStr(formatThousands(raw));
                        const v = parseFloat(raw);
                        // No upper clamp here — sliderMax grows from pendingHigh,
                        // so a user-typed value above the default 200M ceiling is
                        // honored and the slider extends to match.
                        if (!isNaN(v) && v >= pendingLow) {
                          setPendingHigh(v);
                        }
                      }}
                      className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body focus:outline-none focus:border-primary"
                      placeholder="Max"
                    />
                  </div>
                )}
                <RangeSlider
                  min={0}
                  max={sliderMax}
                  low={pendingLow}
                  high={pendingHigh}
                  step={step}
                  onLowChange={(v) => {
                    setPendingLow(v);
                    if (editMode) setLowStr(formatThousands(String(v)));
                  }}
                  onHighChange={(v) => {
                    setPendingHigh(v);
                    if (editMode) setHighStr(formatThousands(String(v)));
                  }}
                  hideLabels={editMode}
                />
                {isDirty && (
                  <div className="px-2 pb-2">
                    <button
                      onClick={applyFilter}
                      className="w-full text-xs py-1 rounded-md bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                    >
                      Apply filter
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="p-3 text-xs text-muted text-center">No data available</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── DATE filter (range inputs) ──────────────────────────────────────────────

function DateFilter({
  definition,
  filters,
  onFiltersChange,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const { open, setOpen, ref } = useDropdown();
  const gteKey = `${definition.Tag}_GTE`;
  const lteKey = `${definition.Tag}_LTE`;
  const currentFrom = [...(filters[gteKey] ?? [])][0] ?? '';
  const currentTo = [...(filters[lteKey] ?? [])][0] ?? '';
  const hasActive = !!currentFrom || !!currentTo;

  const handleChange = (from: string, to: string) => {
    // Reject ranges where From is after To. Native min/max attrs already block
    // the date picker, but typed/pasted entry can bypass that, so we also guard
    // here as a defensive measure.
    if (from && to && from > to) return;
    const next = { ...filters };
    if (from) next[gteKey] = new Set([from]);
    else delete next[gteKey];
    if (to) next[lteKey] = new Set([to]);
    else delete next[lteKey];
    onFiltersChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          hasActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {definition.Label}
        {hasActive && (
          <span className="ml-1 opacity-70">
            ({currentFrom && currentTo
              ? `${currentFrom} - ${currentTo}`
              : currentFrom
                ? `From - ${currentFrom}`
                : `Until - ${currentTo}`})
          </span>
        )}
      </button>
      {open && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg p-3 min-w-52">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-muted block mb-0.5">From</label>
                <input
                  type="date"
                  value={currentFrom}
                  max={currentTo || undefined}
                  onChange={(e) => handleChange(e.target.value, currentTo)}
                  className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body outline-none"
                />
              </div>
              <span className="text-muted text-xs mt-3">&ndash;</span>
              <div className="flex-1">
                <label className="text-[10px] text-muted block mb-0.5">To</label>
                <input
                  type="date"
                  value={currentTo}
                  min={currentFrom || undefined}
                  onChange={(e) => handleChange(currentFrom, e.target.value)}
                  className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body outline-none"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Legacy: Show Only dropdown (sample mode) ────────────────────────────────

const SHOW_ONLY_OPTIONS = ['Untagged', 'Multi Tags', 'Dead End'] as const;

function ShowOnlyDropdown({
  showOnlyUntagged,
  onShowOnlyUntaggedChange,
  showOnlyMultiTagged,
  onShowOnlyMultiTaggedChange,
  showOnlyDeadEnd,
  onShowOnlyDeadEndChange,
}: {
  showOnlyUntagged: boolean;
  onShowOnlyUntaggedChange: (value: boolean) => void;
  showOnlyMultiTagged: boolean;
  onShowOnlyMultiTaggedChange: (value: boolean) => void;
  showOnlyDeadEnd: boolean;
  onShowOnlyDeadEndChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  const activeLabels = [
    showOnlyUntagged && 'Untagged',
    showOnlyMultiTagged && 'Multi Tags',
    showOnlyDeadEnd && 'Dead End',
  ].filter(Boolean) as string[];
  const hasActive = activeLabels.length > 0;

  const handleToggle = (option: typeof SHOW_ONLY_OPTIONS[number]) => {
    switch (option) {
      case 'Untagged':
        onShowOnlyUntaggedChange(!showOnlyUntagged);
        if (!showOnlyUntagged) onShowOnlyMultiTaggedChange(false);
        break;
      case 'Multi Tags':
        onShowOnlyMultiTaggedChange(!showOnlyMultiTagged);
        if (!showOnlyMultiTagged) onShowOnlyUntaggedChange(false);
        break;
      case 'Dead End':
        onShowOnlyDeadEndChange(!showOnlyDeadEnd);
        break;
    }
  };

  const isChecked = (option: typeof SHOW_ONLY_OPTIONS[number]) => {
    switch (option) {
      case 'Untagged': return showOnlyUntagged;
      case 'Multi Tags': return showOnlyMultiTagged;
      case 'Dead End': return showOnlyDeadEnd;
    }
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
          hasActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {hasActive ? `Show: ${activeLabels.join(' & ')}` : 'Show Only'}
      </button>
      {open && panelPos && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          {createPortal(
            <div
              ref={panelRef}
              className="fixed z-50 bg-surface border border-border rounded-lg shadow-lg min-w-64"
              style={{ top: panelPos.top, left: panelPos.left }}
            >
              <div className="p-1.5">
                {SHOW_ONLY_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-surface-hover rounded cursor-pointer text-black dark:text-white"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked(option)}
                      onChange={() => handleToggle(option)}
                      className="rounded border-border-strong"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}

// ─── Legacy: FilterDropdown (sample mode) ────────────────────────────────────

function FilterDropdown({
  label,
  values,
  selected,
  onChange,
  isNumeric,
}: {
  label: string;
  values: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  isNumeric?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const numericInfo = useMemo(() => {
    if (!isNumeric) return null;
    const nums = values.map(Number).sort((a, b) => a - b);
    return { min: nums[0], max: nums[nums.length - 1], sorted: nums };
  }, [isNumeric, values]);

  const [rangelow, setRangeLow] = useState(numericInfo?.min ?? 0);
  const [rangeHigh, setRangeHigh] = useState(numericInfo?.max ?? 0);

  useEffect(() => {
    if (numericInfo) {
      setRangeLow(numericInfo.min);
      setRangeHigh(numericInfo.max);
    }
  }, [numericInfo]);

  const applyRange = useCallback((low: number, high: number) => {
    const inRange = new Set(
      values.filter((v) => {
        const n = Number(v);
        return n >= low && n <= high;
      })
    );
    onChange(inRange);
  }, [values, onChange]);

  const handleLowChange = useCallback((v: number) => {
    setRangeLow(v);
    applyRange(v, rangeHigh);
  }, [applyRange, rangeHigh]);

  const handleHighChange = useCallback((v: number) => {
    setRangeHigh(v);
    applyRange(rangelow, v);
  }, [applyRange, rangelow]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeCount = selected.size;
  const isRangeActive = numericInfo && (rangelow > numericInfo.min || rangeHigh < numericInfo.max);

  // Split into "Selected" / "Available" groups so the eye can find existing
  // picks without breaking the cursor target when the user toggles. Items
  // only move between groups in direct response to a user click.
  // (Computed inline in the render where `values` is in scope.)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          activeCount > 0 || isRangeActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {label}
      </button>
      {open && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-64">
            {numericInfo && (
              <div className={values.length <= 50 ? 'border-b border-border-subtle' : ''}>
                <RangeSlider
                  min={numericInfo.min}
                  max={numericInfo.max}
                  low={rangelow}
                  high={rangeHigh}
                  onLowChange={handleLowChange}
                  onHighChange={handleHighChange}
                />
              </div>
            )}
            {values.length <= 50 && (() => {
              const selectedValues = values.filter((v) => selected.has(v));
              const availableValues = values.filter((v) => !selected.has(v));
              const renderRow = (val: string) => (
                <label
                  key={val}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-surface-hover rounded cursor-pointer text-black dark:text-white"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(val)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(val)) next.delete(val);
                      else next.add(val);
                      onChange(next);
                      if (numericInfo) {
                        const selectedNums = Array.from(next).map(Number);
                        if (selectedNums.length > 0) {
                          setRangeLow(Math.min(...selectedNums));
                          setRangeHigh(Math.max(...selectedNums));
                        } else {
                          setRangeLow(numericInfo.min);
                          setRangeHigh(numericInfo.max);
                        }
                      }
                    }}
                    className="rounded border-border-strong"
                  />
                  <span className="truncate">{isNumeric ? Number(val).toLocaleString() : val}</span>
                </label>
              );
              return (
                <>
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-subtle">
                    <button
                      type="button"
                      onClick={() => onChange(new Set(values))}
                      className="cursor-pointer text-[10px] font-medium text-primary-dark hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange(new Set())}
                      disabled={selected.size === 0}
                      className="cursor-pointer text-[10px] font-medium text-muted hover:text-body hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      Deselect all
                    </button>
                  </div>
                  <div className="p-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                    {selectedValues.length > 0 && (
                      <>
                        <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                          Selected ({selectedValues.length})
                        </div>
                        {selectedValues.map(renderRow)}
                        {availableValues.length > 0 && (
                          <div className="my-1 border-t border-border-subtle" />
                        )}
                      </>
                    )}
                    {availableValues.length > 0 && (
                      <>
                        {selectedValues.length > 0 && (
                          <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                            Available
                          </div>
                        )}
                        {availableValues.map(renderRow)}
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}

// ─── API filter renderer (dispatches to type-specific components) ─────────────

function ApiFilterRenderer({
  definition,
  filters,
  onFiltersChange,
  lockedColumns,
  disabled,
  numericBounds,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  lockedColumns?: Set<string>;
  disabled?: boolean;
  numericBounds?: Map<string, number>;
}) {
  switch (definition.Type) {
    case 'LIST':
      if (definition.Operand === 'EQ') {
        return <ListEqDropdown definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
      }
      return <StringFromListDropdown definition={definition} filters={filters} onFiltersChange={onFiltersChange} locked={lockedColumns?.has(definition.Tag)} disabled={disabled} />;
    case 'SEARCH':
      return <SearchFilter definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
    case 'DECIMAL':
      return <DecimalFilter definition={definition} filters={filters} onFiltersChange={onFiltersChange} dataMax={numericBounds?.get(definition.Tag)} />;
    case 'DATE':
      return <DateFilter definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
    default:
      return null;
  }
}

// ─── Main DynamicFilters component ───────────────────────────────────────────

export function DynamicFilters({
  data,
  fieldMeta,
  tagDefinitions,
  filters,
  onFiltersChange,
  showOnlyUntagged,
  onShowOnlyUntaggedChange,
  showOnlyMultiTagged,
  onShowOnlyMultiTaggedChange,
  showOnlyDeadEnd,
  onShowOnlyDeadEndChange,
  baseFilters,
  endSlot,
  isLiveMode,
  filterDefinitions,
  filterDefinitionsLoading,
  decimalMaxValues,
  disabledFilterTags,
}: DynamicFiltersProps) {
  const [expanded] = useState(true);

  // Columns locked by checkout (baseFilters keys)
  const lockedColumns = useMemo(() => {
    if (!baseFilters) return undefined;
    const keys = Object.keys(baseFilters).filter((k) => baseFilters[k].size > 0);
    return keys.length > 0 ? new Set(keys) : undefined;
  }, [baseFilters]);

  // Sample mode: derive filterable columns from data
  const filterableColumns = useMemo(() => {
    if (isLiveMode) return []; // live mode uses filterDefinitions instead
    const result: { field: string; values: string[]; isNumeric: boolean }[] = [];
    const excluded = new Set([...FILTER_EXCLUSIONS, fieldMeta.identifierField]);

    for (const field of fieldMeta.dataFields) {
      if (excluded.has(field) || /date/i.test(field)) continue;
      const distinctValues = new Set<string>();
      let allNumeric = true;
      for (const item of data) {
        const val = item.row[field];
        if (val !== null && val !== undefined && val !== '') {
          const str = String(val);
          distinctValues.add(str);
          if (allNumeric && isNaN(Number(str))) allNumeric = false;
        }
      }
      const isNumeric = allNumeric && distinctValues.size > 0;
      if (distinctValues.size >= 2 && (isNumeric || distinctValues.size <= 50)) {
        const values = Array.from(distinctValues).sort(
          isNumeric ? (a, b) => Number(a) - Number(b) : undefined
        );
        result.push({ field, values, isNumeric });
      }
    }

    const priority = ['BankSwiftCode', 'Side'];
    result.sort((a, b) => {
      const ai = priority.indexOf(a.field);
      const bi = priority.indexOf(b.field);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    });

    return result;
  }, [data, fieldMeta, isLiveMode]);

  // Running max per field — never decreases, so the slider max reflects the
  // highest value ever seen across all fetched pages regardless of active filters.
  const runningFieldMaxRef = useRef(new Map<string, number>());

  const numericBounds = useMemo(() => {
    const bounds = new Map<string, number>();
    if (!filterDefinitions) return bounds;

    // Update the running max from the current batch of data
    for (const item of data) {
      for (const [field, v] of Object.entries(item.row)) {
        const n = Number(v);
        if (!isNaN(n) && n > 0) {
          const prev = runningFieldMaxRef.current.get(field) ?? 0;
          if (n > prev) runningFieldMaxRef.current.set(field, n);
        }
      }
    }

    // Map each DECIMAL filter tag to its max value
    for (const def of filterDefinitions) {
      if (def.Type !== 'DECIMAL') continue;
      // Prefer the API-probed max (true max across all rows)
      const probed = decimalMaxValues?.get(def.Tag);
      if (probed !== undefined && probed > 0) {
        bounds.set(def.Tag, probed);
        continue;
      }
      // Fall back to running max from loaded rows
      const candidates = [def.Tag, ...def.Values.map((v) => v.Column).filter(Boolean)];
      let max: number | undefined;
      for (const c of candidates) {
        if (runningFieldMaxRef.current.has(c)) { max = runningFieldMaxRef.current.get(c); break; }
      }
      // Case-insensitive substring fallback
      if (max === undefined) {
        const tagLower = def.Tag.toLowerCase();
        for (const [field, m] of runningFieldMaxRef.current) {
          const fl = field.toLowerCase();
          if (fl === tagLower || fl.includes(tagLower) || tagLower.includes(fl)) {
            max = m; break;
          }
        }
      }
      if (max !== undefined && max > 0) bounds.set(def.Tag, max);
    }
    return bounds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filterDefinitions, decimalMaxValues]);

  const tagFilterValues = useMemo(() => {
    if (isLiveMode) return null; // handled by API filter definition
    if (tagDefinitions.length === 0) return null;
    const tags = new Set<string>();
    for (const item of data) {
      for (const tag of item.analysis.tags) {
        tags.add(tag);
      }
    }
    if (tags.size === 0) return null;
    return Array.from(tags).sort();
  }, [data, tagDefinitions, isLiveMode]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    const baseKeys = baseFilters ? new Set(Object.keys(baseFilters)) : new Set<string>();
    for (const [key, selected] of Object.entries(filters)) {
      if (selected.size > 0 && !baseKeys.has(key)) count++;
    }
    if (!isLiveMode) {
      if (showOnlyUntagged) count++;
      if (showOnlyMultiTagged) count++;
      if (showOnlyDeadEnd) count++;
    }
    return count;
  }, [filters, showOnlyUntagged, showOnlyMultiTagged, showOnlyDeadEnd, baseFilters, isLiveMode]);

  const clearAll = () => {
    onFiltersChange(baseFilters ?? {});
    onShowOnlyUntaggedChange(false);
    onShowOnlyMultiTaggedChange(false);
    onShowOnlyDeadEndChange(false);
  };

  const handleFilterChange = (field: string, selected: Set<string>) => {
    const next = { ...filters };
    if (selected.size === 0) {
      delete next[field];
    } else {
      next[field] = selected;
    }
    onFiltersChange(next);
  };

  return (
    <div className="mb-3">
      {expanded && (
        <div data-tour="filters-bar" className="flex flex-wrap items-center gap-2 mt-2 p-3 bg-surface-secondary rounded-lg border border-border">
          {/* Live mode: locked BankSwiftCode pill (not in API filter definitions) */}
          {/* {isLiveMode && lockedColumns?.has('BankSwiftCode') && filters['BankSwiftCode'] && (
            <div className="text-xs px-3 py-1.5 rounded-lg border border-border bg-surface-tertiary text-muted cursor-not-allowed flex items-center gap-1.5">
              <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Bank: {[...filters['BankSwiftCode']][0]}
            </div>
          )} */}

          {/* Live mode: skeleton while loading, then render from API filter definitions */}
          {isLiveMode && filterDefinitionsLoading && (
            <>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-8 w-28 rounded-lg bg-surface-tertiary animate-pulse" />
              ))}
            </>
          )}
          {isLiveMode && !filterDefinitionsLoading && filterDefinitions && filterDefinitions
            .filter((def) => !HIDDEN_API_FILTER_TAGS.has(def.Tag))
            .map((def) => (
            <ApiFilterRenderer
              key={def.Tag}
              definition={def}
              filters={filters}
              onFiltersChange={onFiltersChange}
              lockedColumns={lockedColumns}
              disabled={disabledFilterTags?.has(def.Tag)}
              numericBounds={numericBounds}
            />
          ))}

          {/* Sample mode: legacy filters */}
          {!isLiveMode && (
            <ShowOnlyDropdown
              showOnlyUntagged={showOnlyUntagged}
              onShowOnlyUntaggedChange={onShowOnlyUntaggedChange}
              showOnlyMultiTagged={showOnlyMultiTagged}
              onShowOnlyMultiTaggedChange={onShowOnlyMultiTaggedChange}
              showOnlyDeadEnd={showOnlyDeadEnd}
              onShowOnlyDeadEndChange={onShowOnlyDeadEndChange}
            />
          )}

          {!isLiveMode && tagFilterValues && (
            <FilterDropdown
              label="Tags"
              values={tagFilterValues}
              selected={filters['__tags'] ?? new Set()}
              onChange={(selected) => handleFilterChange('__tags', selected)}
            />
          )}

          {!isLiveMode && filterableColumns.map(({ field, values, isNumeric }) => (
            <FilterDropdown
              key={field}
              label={humanizeFieldName(field)}
              values={values}
              selected={filters[field] ?? new Set()}
              onChange={(selected) => handleFilterChange(field, selected)}
              isNumeric={isNumeric}
            />
          ))}

          <Button
            data-tour="clear-filters"
            variant="danger_ghost"
            size="xs"
            onClick={clearAll}
            className={activeFilterCount === 0 ? 'invisible pointer-events-none' : ''}
          >
            Clear filters
          </Button>

          {endSlot && (
            <div className="ml-auto">
              {endSlot}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
