/**
 * Date input styled to match the wizard's other Basic Info fields, with a
 * small × clear button that appears when the field has a value. Native
 * `<input type="date">` so it picks up the OS calendar popup and accepts
 * the same `YYYY-MM-DD` ISO strings the backend uses.
 *
 * Reused by both the wizard's StepBasicInfo Validity section and the
 * inline rule builder's Validity section in TransactionsTab so they share
 * one implementation, one style, and one clear/normalize convention.
 */

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
  disabled: boolean;
  min?: string;
  error?: boolean;
}

export function DateField({ label, value, onChange, onClear, disabled, min, error }: DateFieldProps) {
  const borderClass = error
    ? 'border-red-400 dark:border-rose-400 focus-within:border-red-500'
    : 'border-input-border focus-within:border-primary';
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-body pl-1">{label}</label>
      <div className={`flex items-center rounded-lg border ${borderClass} bg-input-bg transition-colors`}>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          min={min}
          className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-heading outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
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
      </div>
    </div>
  );
}

/**
 * Normalize whatever the form state holds into a bare `YYYY-MM-DD` before
 * it reaches a `<input type="date">` or a truthy gate. The backend can
 * ship a full ISO datetime (`"2024-01-01T00:00:00"`) for legacy reasons,
 * which the native date input rejects (it falls back to the placeholder).
 * Returns the empty string when the input is null / undefined / empty so
 * the controlled input renders cleanly.
 */
export function toDateInputValue(raw: string | null | undefined): string {
  return raw ? String(raw).split('T')[0] : '';
}
