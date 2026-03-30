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
  onLowChange,
  onHighChange,
}: {
  min: number;
  max: number;
  low: number;
  high: number;
  onLowChange: (v: number) => void;
  onHighChange: (v: number) => void;
}) {
  const range = max - min || 1;
  const lowPct = ((low - min) / range) * 100;
  const highPct = ((high - min) / range) * 100;

  return (
    <div className="px-2 pt-1 pb-2">
      <div className="flex items-center justify-between text-[10px] text-muted mb-1">
        <span>{low.toLocaleString()}</span>
        <span>{high.toLocaleString()}</span>
      </div>
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
          step="any"
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
          step="any"
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

  // DisabledBy logic from API: format "Column:<columnName>"
  const isDisabled = (v: typeof definition.Values[number]) => {
    if (!v.DisabledBy) return false;
    const match = v.DisabledBy.match(/^Column:(.+)$/);
    if (!match) return false;
    const disablingColumn = match[1];
    return selected.has(disablingColumn);
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
    }

    const updated = { ...filters };
    if (next.size === 0) delete updated[key];
    else updated[key] = next;
    onFiltersChange(updated);
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
        {hasActive ? `Show: ${activeLabels.join(' & ')}` : definition.Label}
      </button>
      {open && panelPos && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          {createPortal(
            <div
              ref={panelRef}
              className="fixed z-50 bg-surface border border-border rounded-lg shadow-lg min-w-40"
              style={{ top: panelPos.top, left: panelPos.left }}
            >
              <div className="p-2">
                {definition.Values.map((v) => (
                  <label
                    key={v.Column}
                    className={`flex items-center gap-2 px-2 py-1 text-xs rounded text-black dark:text-white ${
                      isDisabled(v)
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-surface-hover cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={isDisabled(v)}
                      checked={selected.has(v.Column)}
                      onChange={() => handleToggle(v.Column)}
                      className="rounded border-border-strong"
                    />
                    <span>{v.Label}</span>
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
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  const filteredValues = useMemo(() => {
    if (!search.trim()) return definition.Values;
    const term = search.toLowerCase();
    return definition.Values.filter(
      (v) => (v.Label ?? v.Value ?? '').toLowerCase().includes(term) ||
             (v.Value ?? '').toLowerCase().includes(term)
    );
  }, [definition.Values, search]);

  const handleToggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);

    const updated = { ...filters };
    if (next.size === 0) delete updated[key];
    else updated[key] = next;
    onFiltersChange(updated);
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
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-40">
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
                    className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  />
                </div>
              </div>
            )}
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {filteredValues.length === 0 ? (
                <div className="px-2 py-3 text-xs text-faint text-center">No matches</div>
              ) : (
                <>
                  {/* Selected items sticky at top */}
                  {filteredValues.some((v) => selected.has(v.Value ?? '')) && (
                    <div className="sticky top-0 z-10 bg-surface p-1.5 pb-0">
                      {filteredValues.filter((v) => selected.has(v.Value ?? '')).map((v) => (
                        <label
                          key={v.Value}
                          className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-surface-hover rounded cursor-pointer text-black dark:text-white whitespace-nowrap bg-primary/5"
                        >
                          <input
                            type="checkbox"
                            checked
                            onChange={() => handleToggle(v.Value ?? '')}
                            className="rounded border-border-strong shrink-0"
                          />
                          <span className="truncate">{v.Label ?? v.Value}</span>
                        </label>
                      ))}
                      {filteredValues.some((v) => !selected.has(v.Value ?? '')) && (
                        <div className="border-t border-border-subtle mt-1" />
                      )}
                    </div>
                  )}
                  {/* Unselected items */}
                  <div className="p-1.5 pt-0">
                    {filteredValues.filter((v) => !selected.has(v.Value ?? '')).map((v) => (
                      <label
                        key={v.Value}
                        className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-surface-hover rounded cursor-pointer text-black dark:text-white whitespace-nowrap"
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handleToggle(v.Value ?? '')}
                          className="rounded border-border-strong shrink-0"
                        />
                        <span className="truncate">{v.Label ?? v.Value}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
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
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors w-40 outline-none ${
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

// ─── DECIMAL filter (range inputs) ───────────────────────────────────────────

function DecimalFilter({
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
  const currentMin = [...(filters[gteKey] ?? [])][0] ?? '';
  const currentMax = [...(filters[lteKey] ?? [])][0] ?? '';
  const hasActive = !!currentMin || !!currentMax;

  const [minVal, setMinVal] = useState(currentMin);
  const [maxVal, setMaxVal] = useState(currentMax);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { setMinVal(currentMin); }, [currentMin]);
  useEffect(() => { setMaxVal(currentMax); }, [currentMax]);

  const applyRange = useCallback((min: string, max: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Enforce max >= min when both are set
      let effectiveMax = max;
      if (min.trim() && max.trim() && Number(max) < Number(min)) {
        effectiveMax = min;
      }
      const next = { ...filters };
      if (min.trim()) next[gteKey] = new Set([min.trim()]);
      else delete next[gteKey];
      if (effectiveMax.trim()) next[lteKey] = new Set([effectiveMax.trim()]);
      else delete next[lteKey];
      onFiltersChange(next);
    }, 400);
  }, [filters, gteKey, lteKey, onFiltersChange]);

  const handleMinChange = (val: string) => {
    setMinVal(val);
    // If max is set and now less than new min, bump max up to match
    if (maxVal && val && Number(maxVal) < Number(val)) {
      setMaxVal(val);
      applyRange(val, val);
    } else {
      applyRange(val, maxVal);
    }
  };

  const handleMaxChange = (val: string) => {
    // Clamp max to be at least the min value
    let effective = val;
    if (minVal && val && Number(val) < Number(minVal)) {
      effective = minVal;
    }
    setMaxVal(effective);
    applyRange(minVal, effective);
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
        {hasActive && <span className="ml-1 opacity-70">({currentMin || '*'} - {currentMax || '*'})</span>}
      </button>
      {open && (
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg p-3 min-w-52">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-muted block mb-0.5">Min</label>
                <input
                  type="number"
                  value={minVal}
                  onChange={(e) => handleMinChange(e.target.value)}
                  placeholder="0"
                  className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body outline-none"
                />
              </div>
              <span className="text-muted text-xs mt-3">&ndash;</span>
              <div className="flex-1">
                <label className="text-[10px] text-muted block mb-0.5">Max</label>
                <input
                  type="number"
                  value={maxVal}
                  onChange={(e) => handleMaxChange(e.target.value)}
                  min={minVal || undefined}
                  placeholder="..."
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
            ({currentFrom || '...'} - {currentTo || '...'})
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
              className="fixed z-50 bg-surface border border-border rounded-lg shadow-lg min-w-40"
              style={{ top: panelPos.top, left: panelPos.left }}
            >
              <div className="p-2">
                {SHOW_ONLY_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-surface-hover rounded cursor-pointer text-black dark:text-white"
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
          <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-55">
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
            {values.length <= 50 && (
              <div className="p-2 max-h-48 overflow-y-auto">
                {values.map((val) => (
                  <label
                    key={val}
                    className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-surface-hover rounded cursor-pointer text-black dark:text-white"
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
                ))}
              </div>
            )}
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
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  lockedColumns?: Set<string>;
  disabled?: boolean;
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
      return <DecimalFilter definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
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
        <div className="flex flex-wrap items-center gap-2 mt-2 p-3 bg-surface-secondary rounded-lg border border-border">
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
          {isLiveMode && !filterDefinitionsLoading && filterDefinitions && filterDefinitions.map((def) => (
            <ApiFilterRenderer
              key={def.Tag}
              definition={def}
              filters={filters}
              onFiltersChange={onFiltersChange}
              lockedColumns={lockedColumns}
              disabled={disabledFilterTags?.has(def.Tag)}
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

          {activeFilterCount > 0 && (
            <Button variant="danger_ghost" size="xs" onClick={clearAll}>
              Clear filters
            </Button>
          )}

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
