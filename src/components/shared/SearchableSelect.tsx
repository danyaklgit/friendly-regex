import { useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DropdownBackdrop } from './DropdownBackdrop';

interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  onCreateNew?: () => void;
  createNewLabel?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  onCreateNew,
  createNewLabel = '+ Create New',
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleScroll = (e: Event) => {
      // Don't close when scrolling inside the dropdown itself
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchInputRef.current?.focus(), 0);
    if (!open) setSearch('');
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        o.value.toLowerCase().includes(term) ||
        (o.sublabel?.toLowerCase().includes(term) ?? false)
    );
  }, [options, search]);

  const selectedLabel = options.find((o) => o.value === value)?.label || value || placeholder;

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-1.5 rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-heading focus:outline-none focus:ring-1 focus:ring-primary transition-colors ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${!value ? 'text-placeholder' : ''}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg className="w-3 h-3 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && !disabled && createPortal(
        <>
          <DropdownBackdrop onClick={() => setOpen(false)} />
          <div
            ref={dropdownRef}
            className="fixed z-[10000] min-w-64 bg-surface border border-border rounded-lg shadow-lg"
            style={{ top: dropdownPos.top, left: dropdownPos.left, width: Math.max(dropdownPos.width, 256) }}
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
                  placeholder="Search…"
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
                filtered.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left flex flex-col px-2 py-1.5 text-xs rounded transition-colors ${
                      value === opt.value
                        ? 'text-primary font-medium bg-primary/5'
                        : 'text-heading hover:bg-surface-hover'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-[10px] text-faint">{opt.sublabel}</span>
                    )}
                  </button>
                ))
              )}
            </div>
            {onCreateNew && (
              <div className="border-t border-border-subtle p-1.5">
                <button
                  type="button"
                  onClick={() => { setOpen(false); onCreateNew(); }}
                  className="w-full text-left px-2 py-1.5 text-xs text-primary font-medium rounded hover:bg-primary/5 transition-colors"
                >
                  {createNewLabel}
                </button>
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
