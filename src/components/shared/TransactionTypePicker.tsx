import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FilterDefinition } from '../../api/transactions';
import { TXN_TYPE_OPTIONS } from '../../constants/fields';
import { DropdownBackdrop } from './DropdownBackdrop';

interface TransactionTypePickerProps {
  value: string;
  onChange: (value: string) => void;
  filterDefinitions?: FilterDefinition[];
  disabled?: boolean;
  /** Extra classes for the trigger button. Use `!`-prefixed utilities to
   *  override defaults (e.g. `!py-1`, `!max-w-[180px]`). */
  triggerClassName?: string;
}

export function TransactionTypePicker({ value, onChange, filterDefinitions, disabled, triggerClassName }: TransactionTypePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Close on outside click — must check both anchor and portal-rendered menu.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Position the portal menu under the trigger; recompute on scroll/resize.
  // Clamps left so a wide menu near the right edge never overflows the viewport
  // (which would otherwise force the page into horizontal scroll).
  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth ?? 256; // matches min-w-64
      if (!rect) return;
      const margin = 8;
      const maxLeft = window.innerWidth - menuWidth - margin;
      const left = Math.max(margin, Math.min(rect.left, maxLeft));
      setMenuPos({ top: rect.bottom + 4, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Lock page scroll (both axes) while the menu is open so the user can't
  // scroll the trigger out from under the portal-rendered menu. We compensate
  // for the disappearing vertical scrollbar with paddingRight to avoid layout
  // shift, and restore prior inline styles on close.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.paddingRight = prev.bodyPaddingRight;
    };
  }, [open]);

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
        sublabel: v.SubLabel ?? undefined,
      }));
    }
    return TXN_TYPE_OPTIONS.map((t) => ({ value: t, label: t, sublabel: undefined }));
  }, [filterDefinitions]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term) ||
             (o.sublabel ?? '').toLowerCase().includes(term)
    );
  }, [options, search]);

  const selectedOption = options.find((o) => o.value === value);
  const selectedDisplay = selectedOption
    ? (selectedOption.value !== selectedOption.label && selectedOption.label ? `${selectedOption.value} — ${selectedOption.label}` : selectedOption.label)
    : null;
  const selectedLabel = selectedDisplay || value || 'Select a type';

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  // Reset the keyboard cursor whenever the visible list changes. On open,
  // land on the currently selected option (or 0 if none) so arrow keys feel
  // anchored. While typing in search, drop back to the top of the results.
  useEffect(() => {
    if (search) {
      setHighlightIndex(0);
      return;
    }
    const idx = filtered.findIndex((o) => o.value === value);
    setHighlightIndex(idx >= 0 ? idx : 0);
  }, [search, open, filtered, value]);

  // Keep the highlighted option scrolled into view as the user arrows through.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-opt-index="${highlightIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, open]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (filtered.length === 0 ? 0 : Math.min(i + 1, filtered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlightIndex];
      if (opt) handleSelect(opt.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center justify-between gap-1.5 min-w-28 rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-heading focus:outline-none focus:ring-1 focus:ring-primary transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${triggerClassName ?? ''}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg className="w-3 h-3 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && !disabled && menuPos && createPortal(
        <>
        <DropdownBackdrop onClick={() => setOpen(false)} />
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-50 min-w-64 bg-surface border border-border rounded-lg shadow-lg">
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
                onKeyDown={handleSearchKeyDown}
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-60 overflow-y-auto custom-scrollbar p-1.5">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-faint text-center">No matches</div>
            ) : (
              filtered.map((opt, idx) => {
                const hasDistinctLabel = opt.value !== opt.label;
                const isHighlighted = idx === highlightIndex;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-opt-index={idx}
                    onClick={() => handleSelect(opt.value)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`w-full text-left flex items-start gap-2 px-2 py-1.5 text-xs rounded transition-colors ${
                      value === opt.value ? 'bg-primary/5' : ''
                    } ${isHighlighted ? 'ring-1 ring-inset ring-primary/40' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className={`block font-medium truncate ${value === opt.value ? 'text-primary' : 'text-heading'}`}>{opt.value}</span>
                      {hasDistinctLabel && <span className="block text-[10px] text-muted truncate">{opt.label}</span>}
                      {opt.sublabel && <span className="block text-[10px] text-faint truncate">{opt.sublabel}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        </>,
        document.body,
      )}
    </div>
  );
}
