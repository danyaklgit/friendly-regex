/**
 * Date input that DISPLAYS and accepts the `YYYY-MM-DD` ISO format — the same
 * format the transactions table shows for Statement Date — instead of the
 * browser-locale format a native `<input type="date">` renders (e.g.
 * `mm/dd/yyyy` in en-US). The value handed to / from this component is always
 * the bare `YYYY-MM-DD` ISO string, exactly as before, so nothing downstream
 * (form state, API payloads, the StatementDate filter) changes.
 *
 * Implementation: a text input shows the ISO value and lets the operator type
 * it; a calendar button opens the native OS date picker (via `showPicker()` on
 * a visually-hidden `<input type="date">`) so picking still works. Typing is
 * the reliable fallback when `showPicker` is unavailable.
 *
 * Reused by both the wizard's StepBasicInfo Validity section and the inline
 * rule builder's Validity section in TransactionsTab so they share one
 * implementation, one style, and one clear/normalize convention.
 */

import { useEffect, useRef, useState } from 'react';

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
  disabled: boolean;
  min?: string;
  error?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a real calendar date in `YYYY-MM-DD` shape (rejects rollovers
 *  like 2024-02-31, which `new Date` would silently shift to March). */
function isValidIso(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d;
}

export function DateField({ label, value, onChange, onClear, disabled, min, error }: DateFieldProps) {
  // Local buffer so partial / in-progress typing ("2024-08-1") stays in the
  // field without being pushed upstream until it parses as a full ISO date.
  const [text, setText] = useState(value);
  // Resync when the committed value changes from the outside (calendar pick,
  // clear, Discard, an external reset) so the field reflects real state.
  useEffect(() => { setText(value); }, [value]);

  const nativeRef = useRef<HTMLInputElement>(null);

  const borderClass = error
    ? 'border-red-400 dark:border-rose-400 focus-within:border-red-500'
    : 'border-input-border focus-within:border-primary';

  const handleText = (raw: string) => {
    setText(raw);
    if (raw === '') {
      onChange('');
    } else if (isValidIso(raw)) {
      onChange(raw);
    }
    // Otherwise keep the buffer but don't propagate an incomplete value.
  };

  const handleBlur = () => {
    // Snap back to the committed value when the buffer never resolved to one
    // (incomplete typing, an invalid date, or a value the parent rejected such
    // as an inverted range) so the field can't show an uncommitted string.
    if (text !== value) setText(value);
  };

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch { /* needs a user gesture; the click is one, ignore otherwise */ }
    } else {
      // Older browsers: focusing the native control lets the operator open it.
      el.focus();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-body pl-1">{label}</label>
      <div className={`relative flex items-center rounded-lg border ${borderClass} bg-input-bg transition-colors`}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="yyyy-mm-dd"
          value={text}
          onChange={(e) => handleText(e.target.value)}
          onBlur={handleBlur}
          disabled={disabled}
          className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-heading outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        {!disabled && (
          <button
            type="button"
            onClick={openPicker}
            aria-label={`Open calendar for ${label}`}
            title="Open calendar"
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded text-faint hover:text-body hover:bg-surface-hover transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        )}
        {value && !disabled && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label}`}
            title={`Clear ${label}`}
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 mr-1 rounded text-faint hover:text-body hover:bg-surface-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        )}
        {/* Visually-hidden native date input used ONLY as the OS calendar
            popup target (showPicker anchors to it). Kept rendered (not
            display:none) so showPicker stays allowed. */}
        <input
          ref={nativeRef}
          type="date"
          value={value}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute right-2 bottom-1 h-0 w-0 opacity-0"
        />
      </div>
    </div>
  );
}

/**
 * Normalize whatever the form state holds into a bare `YYYY-MM-DD`. The backend
 * can ship a full ISO datetime (`"2024-01-01T00:00:00"`) for legacy reasons;
 * strip the time so the field shows just the date. Returns the empty string
 * when the input is null / undefined / empty so the controlled input renders
 * cleanly.
 */
export function toDateInputValue(raw: string | null | undefined): string {
  return raw ? String(raw).split('T')[0] : '';
}
