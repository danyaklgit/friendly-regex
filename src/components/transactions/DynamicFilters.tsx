import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AnalyzedTransaction, TagSpecDefinition } from '../../types';
import type { FieldMeta } from '../../utils/deriveFieldMeta';
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
}

/** Dual-thumb range slider for numeric filters */
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
        {/* Track background */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-surface-tertiary rounded" />
        {/* Active range */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 bg-primary rounded"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
        />
        {/* Low thumb */}
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
        {/* High thumb */}
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
                className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-surface-hover rounded cursor-pointer"
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

  // Numeric range state
  const numericInfo = useMemo(() => {
    if (!isNumeric) return null;
    const nums = values.map(Number).sort((a, b) => a - b);
    return { min: nums[0], max: nums[nums.length - 1], sorted: nums };
  }, [isNumeric, values]);

  const [rangelow, setRangeLow] = useState(numericInfo?.min ?? 0);
  const [rangeHigh, setRangeHigh] = useState(numericInfo?.max ?? 0);

  // Reset range when dropdown opens or numericInfo changes
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
        {/* {activeCount > 0 && (
          <span className="ml-1.5 bg-blue-600 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">
            {activeCount}
          </span>
        )} */}
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
                  className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-surface-hover rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(val)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(val)) next.delete(val);
                      else next.add(val);
                      onChange(next);
                      // Sync range slider to match manual selection
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
}: DynamicFiltersProps) {
  const [expanded, _setExpanded] = useState(true);

  const filterableColumns = useMemo(() => {
    const excluded = new Set([...FILTER_EXCLUSIONS, fieldMeta.identifierField]);
    const result: { field: string; values: string[]; isNumeric: boolean }[] = [];

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
  }, [data, fieldMeta]);

  const tagFilterValues = useMemo(() => {
    if (tagDefinitions.length === 0) return null;
    const tags = new Set<string>();
    for (const item of data) {
      for (const tag of item.analysis.tags) {
        tags.add(tag);
      }
    }
    if (tags.size === 0) return null;
    return Array.from(tags).sort();
  }, [data, tagDefinitions]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    const baseKeys = baseFilters ? new Set(Object.keys(baseFilters)) : new Set<string>();
    for (const [key, selected] of Object.entries(filters)) {
      if (selected.size > 0 && !baseKeys.has(key)) count++;
    }
    if (showOnlyUntagged) count++;
    if (showOnlyMultiTagged) count++;
    if (showOnlyDeadEnd) count++;
    return count;
  }, [filters, showOnlyUntagged, showOnlyMultiTagged, showOnlyDeadEnd, baseFilters]);

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
      {/* <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 text-sm cursor-pointer font-medium text-slate-600 hover:text-heading transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 text-faint transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Filters
        {activeFilterCount > 0 && (
          <span className="bg-blue-600 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">
            {activeFilterCount}
          </span>
        )}
      </button> */}

      {expanded && (
        <div className="flex flex-wrap items-center gap-2 mt-2 p-3 bg-surface-secondary rounded-lg border border-border">
          <ShowOnlyDropdown
            showOnlyUntagged={showOnlyUntagged}
            onShowOnlyUntaggedChange={onShowOnlyUntaggedChange}
            showOnlyMultiTagged={showOnlyMultiTagged}
            onShowOnlyMultiTaggedChange={onShowOnlyMultiTaggedChange}
            showOnlyDeadEnd={showOnlyDeadEnd}
            onShowOnlyDeadEndChange={onShowOnlyDeadEndChange}
          />

          {tagFilterValues && (
            <FilterDropdown
              label="Tags"
              values={tagFilterValues}
              selected={filters['__tags'] ?? new Set()}
              onChange={(selected) => handleFilterChange('__tags', selected)}
            />
          )}

          {filterableColumns.map(({ field, values, isNumeric }) => (
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
            <Button variant="danger" size="sm" onClick={clearAll}>
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
