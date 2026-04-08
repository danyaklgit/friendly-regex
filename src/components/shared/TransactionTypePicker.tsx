import { useState, useRef, useEffect, useMemo } from 'react';
import type { FilterDefinition } from '../../api/transactions';
import { TXN_TYPE_OPTIONS } from '../../constants/fields';
import { DropdownBackdrop } from './DropdownBackdrop';

interface TransactionTypePickerProps {
  value: string;
  onChange: (value: string) => void;
  filterDefinitions?: FilterDefinition[];
  disabled?: boolean;
}

export function TransactionTypePicker({ value, onChange, filterDefinitions, disabled }: TransactionTypePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => searchInputRef.current?.focus(), 0);
    if (!open) setSearch('');
  }, [open]);

  // Build options from filterDefinitions if available, else fall back to constants
  const options = useMemo(() => {
    const txnDef = filterDefinitions?.find(
      (d) => d.Tag === 'TransactionTypeCode' || d.Label?.toLowerCase().includes('transaction type')
    );
    if (txnDef && txnDef.Values.length > 0) {
      return txnDef.Values.map((v) => ({
        value: v.Value ?? '',
        label: v.Label ?? v.Value ?? '',
      }));
    }
    return TXN_TYPE_OPTIONS.map((t) => ({ value: t, label: t }));
  }, [filterDefinitions]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term)
    );
  }, [options, search]);

  const selectedOption = options.find((o) => o.value === value);
  const selectedDisplay = selectedOption
    ? (selectedOption.value !== selectedOption.label && selectedOption.label ? `${selectedOption.value} — ${selectedOption.label}` : selectedOption.label)
    : null;
  const selectedLabel = selectedDisplay || value || 'All types';

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center justify-between gap-1.5 min-w-28 rounded-lg border border-input-border bg-input-bg px-3 py-1 text-xs text-heading focus:outline-none focus:ring-1 focus:ring-primary transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg className="w-3 h-3 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && !disabled && (
        <>
        <DropdownBackdrop onClick={() => setOpen(false)} />
        <div className="absolute z-50 top-full mt-1 left-0 min-w-64 bg-surface border border-border rounded-lg shadow-lg">
          {/* Search */}
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
                placeholder="Search swift mt940 transaction types..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1.5">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-faint text-center">No matches</div>
            ) : (
              filtered.map((opt) => {
                const hasDistinctLabel = opt.value !== opt.label;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left flex items-start gap-2 px-2 py-1.5 text-xs rounded transition-colors ${
                      value === opt.value ? 'bg-primary/5' : 'hover:bg-surface-hover'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className={`block font-medium truncate ${value === opt.value ? 'text-primary' : 'text-heading'}`}>{opt.value}</span>
                      {hasDistinctLabel && <span className="block text-[10px] text-muted truncate">{opt.label}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
