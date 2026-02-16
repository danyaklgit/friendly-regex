import { useState, useRef, useEffect, useMemo } from 'react';
import type { AnalyzedTransaction, TagSpecDefinition } from '../../types';
import type { FieldMeta } from '../../utils/deriveFieldMeta';
import { Toggle } from '../shared/Toggle';
import { Button } from '../shared/Button';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

type FilterState = Record<string, Set<string>>;

const FILTER_EXCLUSIONS = new Set([
  'AdditionalInformation',
  'TransactionDetails',
  'Description1',
  'Description2',
  'BankSwiftCode'
]);

interface DynamicFiltersProps {
  data: AnalyzedTransaction[];
  fieldMeta: FieldMeta;
  tagDefinitions: TagSpecDefinition[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  showOnlyUntagged: boolean;
  onShowOnlyUntaggedChange: (value: boolean) => void;
}

function FilterDropdown({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          selected.size > 0
            ? 'bg-blue-50 border-blue-300 text-blue-700'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
        }`}
      >
        {label}
        {selected.size > 0 && (
          <span className="ml-1.5 bg-blue-600 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">
            {selected.size}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[180px] max-h-60 overflow-y-auto">
          {values.map((val) => (
            <label
              key={val}
              className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-gray-50 rounded cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(val)}
                onChange={() => {
                  const next = new Set(selected);
                  if (next.has(val)) next.delete(val);
                  else next.add(val);
                  onChange(next);
                }}
                className="rounded border-gray-300"
              />
              <span className="truncate">{val}</span>
            </label>
          ))}
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
}: DynamicFiltersProps) {
  const [expanded, setExpanded] = useState(true);

  const filterableColumns = useMemo(() => {
    const excluded = new Set([...FILTER_EXCLUSIONS, fieldMeta.identifierField]);
    const result: { field: string; values: string[] }[] = [];

    for (const field of fieldMeta.dataFields) {
      if (excluded.has(field) || /date/i.test(field)) continue;
      const distinctValues = new Set<string>();
      for (const item of data) {
        const val = item.row[field];
        if (val !== null && val !== undefined && val !== '') {
          distinctValues.add(String(val));
        }
      }
      if (distinctValues.size >= 2 && distinctValues.size <= 50) {
        result.push({ field, values: Array.from(distinctValues).sort() });
      }
    }

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
    for (const selected of Object.values(filters)) {
      if (selected.size > 0) count++;
    }
    if (showOnlyUntagged) count++;
    return count;
  }, [filters, showOnlyUntagged]);

  const clearAll = () => {
    onFiltersChange({});
    onShowOnlyUntaggedChange(false);
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
        className="flex items-center gap-1.5 text-sm cursor-pointer font-medium text-slate-600 hover:text-gray-900 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
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
        <div className="flex flex-wrap items-center gap-2 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <Toggle
            label="Untagged only"
            checked={showOnlyUntagged}
            onChange={onShowOnlyUntaggedChange}
          />

          <div className="w-px h-6 bg-gray-300 mx-1" />

          {tagFilterValues && (
            <FilterDropdown
              label="Tags"
              values={tagFilterValues}
              selected={filters['__tags'] ?? new Set()}
              onChange={(selected) => handleFilterChange('__tags', selected)}
            />
          )}

          {filterableColumns.map(({ field, values }) => (
            <FilterDropdown
              key={field}
              label={humanizeFieldName(field)}
              values={values}
              selected={filters[field] ?? new Set()}
              onChange={(selected) => handleFilterChange(field, selected)}
            />
          ))}

          {activeFilterCount > 0 && (
            <Button variant="danger" size="sm" onClick={clearAll}>
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
