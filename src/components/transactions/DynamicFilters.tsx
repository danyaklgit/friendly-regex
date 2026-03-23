import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AnalyzedTransaction, TagSpecDefinition } from '../../types';
import type { FieldMeta } from '../../utils/deriveFieldMeta';
import type { FilterDefinition } from '../../api/transactions';
import { Button } from '../shared/Button';
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

// ─── BOOL filter (Show Only) ──────────────────────────────────────────────────

function BoolFilterDropdown({
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

  const activeLabels = definition.Values.filter(
    (v) => filters[`__bool:${v.Column}`]?.has('true')
  ).map((v) => v.Label);
  const hasActive = activeLabels.length > 0;

  const isUntaggedChecked = definition.Values.some(
    (v) => v.Label === 'Untagged' && filters[`__bool:${v.Column}`]?.has('true')
  );
  const hasNonExemptChecked = definition.Values.some(
    (v) => v.Label !== 'Untagged' && v.Label !== 'Dead End' && filters[`__bool:${v.Column}`]?.has('true')
  );

  const isDisabled = (v: { Label: string }) => {
    if (v.Label === 'Dead End') return false;
    if (v.Label === 'Untagged') return hasNonExemptChecked;
    return isUntaggedChecked;
  };

  const handleToggle = (column: string) => {
    const key = `__bool:${column}`;
    const next = { ...filters };
    if (next[key]?.has('true')) {
      delete next[key];
    } else {
      next[key] = new Set(['true']);
    }
    onFiltersChange(next);
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
      {open && panelPos && createPortal(
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
                  checked={filters[`__bool:${v.Column}`]?.has('true') ?? false}
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
    </div>
  );
}

// ─── STRING-FROM-LIST filter ──────────────────────────────────────────────────

function StringFromListDropdown({
  definition,
  filters,
  onFiltersChange,
  locked,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  locked?: boolean;
}) {
  const { open, setOpen, ref } = useDropdown();
  const column = definition.Values[0]?.Column ?? definition.Tag;
  const selected = filters[column] ?? new Set<string>();
  const hasActive = selected.size > 0;

  const handleToggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);

    const updated = { ...filters };
    if (next.size === 0) delete updated[column];
    else updated[column] = next;
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
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          hasActive
            ? 'bg-primary/10 border-primary/30 text-primary-dark'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        {definition.Label}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg min-w-40">
          <div className="p-2 max-h-48 overflow-y-auto">
            {definition.Values.map((v) => (
              <label
                key={v.Value}
                className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-surface-hover rounded cursor-pointer text-black dark:text-white"
              >
                <input
                  type="checkbox"
                  checked={selected.has(v.Value ?? '')}
                  onChange={() => handleToggle(v.Value ?? '')}
                  className="rounded border-border-strong"
                />
                <span>{v.Label}</span>
              </label>
            ))}
          </div>
        </div>
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
  const column = definition.Values[0]?.Column ?? '';
  const key = `__search:${column}`;
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
  const column = definition.Values[0]?.Column ?? '';
  const gteKey = `__decimal_gte:${column}`;
  const lteKey = `__decimal_lte:${column}`;
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
      const next = { ...filters };
      if (min.trim()) next[gteKey] = new Set([min.trim()]);
      else delete next[gteKey];
      if (max.trim()) next[lteKey] = new Set([max.trim()]);
      else delete next[lteKey];
      onFiltersChange(next);
    }, 400);
  }, [filters, gteKey, lteKey, onFiltersChange]);

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
        <div className="absolute top-full mt-1 left-0 z-50 bg-surface border border-border rounded-lg shadow-lg p-3 min-w-52">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted block mb-0.5">Min</label>
              <input
                type="number"
                value={minVal}
                onChange={(e) => { setMinVal(e.target.value); applyRange(e.target.value, maxVal); }}
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
                onChange={(e) => { setMaxVal(e.target.value); applyRange(minVal, e.target.value); }}
                placeholder="..."
                className="w-full text-xs px-2 py-1 rounded border border-border-strong bg-surface text-body outline-none"
              />
            </div>
          </div>
        </div>
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
  const column = definition.Values[0]?.Column ?? '';
  const gteKey = `__date_gte:${column}`;
  const lteKey = `__date_lte:${column}`;
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
      )}
    </div>
  );
}

// ─── STRING filter (free text) ───────────────────────────────────────────────

function StringFilter({
  definition,
  filters,
  onFiltersChange,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const column = definition.Values[0]?.Column ?? '';
  const key = `__string:${column}`;
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
      {open && panelPos && createPortal(
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
      )}
    </div>
  );
}

// ─── API filter renderer (dispatches to type-specific components) ─────────────

function ApiFilterRenderer({
  definition,
  filters,
  onFiltersChange,
  tagDefinitions,
  data,
  lockedColumns,
}: {
  definition: FilterDefinition;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  tagDefinitions: TagSpecDefinition[];
  data: AnalyzedTransaction[];
  lockedColumns?: Set<string>;
}) {
  // Compute tag values unconditionally (hooks must not be conditional)
  const tagValues = useMemo(() => {
    const tags = new Set<string>();
    for (const item of data) {
      for (const tag of item.analysis.tags) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [data]);

  switch (definition.Type) {
    case 'BOOL':
      return <BoolFilterDropdown definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
    case 'STRING-FROM-LIST': {
      const col = definition.Values[0]?.Column ?? definition.Tag;
      return <StringFromListDropdown definition={definition} filters={filters} onFiltersChange={onFiltersChange} locked={lockedColumns?.has(col)} />;
    }
    case 'SEARCH':
      return <SearchFilter definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
    case 'API': {
      if (tagValues.length === 0 && tagDefinitions.length === 0) return null;

      return (
        <FilterDropdown
          label={definition.Label}
          values={tagValues.length > 0 ? tagValues : tagDefinitions.map((d) => d.Tag)}
          selected={filters['__tags'] ?? new Set()}
          onChange={(selected) => {
            const next = { ...filters };
            if (selected.size === 0) delete next['__tags'];
            else next['__tags'] = selected;
            onFiltersChange(next);
          }}
        />
      );
    }
    case 'DECIMAL':
      return <DecimalFilter definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
    case 'STRING':
      return <StringFilter definition={definition} filters={filters} onFiltersChange={onFiltersChange} />;
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

          {/* Live mode: render from API filter definitions */}
          {isLiveMode && filterDefinitions && filterDefinitions.map((def) => (
            <ApiFilterRenderer
              key={def.Tag}
              definition={def}
              filters={filters}
              onFiltersChange={onFiltersChange}
              tagDefinitions={tagDefinitions}
              data={data}
              lockedColumns={lockedColumns}
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
