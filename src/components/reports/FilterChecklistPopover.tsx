import { useState } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from '@floating-ui/react';

export interface ChecklistOption {
  value: string;
  label: string;
  /** Raw code for the hover title when the label is a friendly name. */
  title?: string;
}

interface FilterChecklistPopoverProps {
  /** "Feed", "Bank", "Side". Prefixes the trigger text and names the dialog. */
  label: string;
  options: ChecklistOption[];
  /** Selected values; [] means "all" (no filter sent). */
  selected: string[];
  /** Always called with values in OPTION order, never insertion order. */
  onChange: (next: string[]) => void;
  disabled?: boolean;
  emptyLabel?: string;
}

/**
 * Multi-select dropdown for the Reports filter row. Empty selection means
 * "all" and is what the request builders treat as "send no filter", so the
 * trigger reads "Feed: All" rather than "Feed: none". Same floating-ui
 * recipe as OverflowMenu (portal, focus manager, outside click + Escape).
 */
export function FilterChecklistPopover({ label, options, selected, onChange, disabled, emptyLabel = 'No options' }: FilterChecklistPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });
  const click = useClick(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'dialog' });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  const summary =
    selected.length === 0 ? 'All'
      : selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;
  const triggerText = `${label}: ${summary}`;

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange(options.map((o) => o.value).filter((v) => next.has(v)));
  };

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        disabled={disabled}
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs whitespace-nowrap transition-colors
          ${selected.length > 0 ? 'bg-primary/10 border-primary/30 text-primary-dark dark:text-primary' : 'bg-surface border-border-strong text-body hover:bg-surface-hover'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isOpen ? 'ring-1 ring-primary' : ''}`}
        {...getReferenceProps()}
      >
        {triggerText}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              aria-label={label}
              {...getFloatingProps()}
              className="z-[9999] min-w-[200px] max-h-72 overflow-auto custom-scrollbar bg-surface-elevated border border-border rounded-md shadow-lg py-1 outline-none"
            >
              <div className="flex items-center justify-between px-3 py-1 border-b border-border-subtle">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  disabled={selected.length === 0}
                  className="text-[11px] text-primary-dark dark:text-primary hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
                >
                  Show all
                </button>
              </div>
              {options.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted">{emptyLabel}</p>
              ) : (
                options.map((option) => (
                  <label key={option.value} title={option.title} className="flex items-center gap-2 px-3 py-1.5 text-xs text-body hover:bg-surface-active cursor-pointer">
                    <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} className="accent-primary" />
                    <span className="truncate">{option.label}</span>
                  </label>
                ))
              )}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
