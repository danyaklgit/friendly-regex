import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  error?: boolean;
  placeholder?: string;
}

export function Select({ label, options, className = '', id, error, placeholder, ...props }: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  const borderClass = error
    ? 'border-red-400 dark:border-rose-400 focus:border-red-500 focus:ring-red-500'
    : 'border-input-border focus:border-primary focus:ring-primary';
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="flex items-center gap-1 pl-1">
          <label htmlFor={selectId} className="text-xs font-medium text-body">
            {label}{props.required && <span className="text-red-500 dark:text-rose-300 ml-0.5">*</span>}
          </label>
          {error && (
            <span
              aria-hidden="true"
              className="text-red-500 dark:text-rose-300 text-xs font-bold leading-none"
              title="Invalid value"
            >
              !
            </span>
          )}
        </div>
      )}
      <select
        id={selectId}
        aria-invalid={error || undefined}
        className={`block w-full rounded-lg border ${borderClass} bg-input-bg px-3 py-2 text-sm
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:ring-1 outline-none transition-colors ${placeholder && !props.value ? 'text-placeholder' : 'text-heading'} ${className}`}
        {...props}
      >
        {/* The select element carries text-placeholder grey while no value is
            picked, and Chromium's native option popup INHERITS that color —
            without an explicit color every option in the open list rendered
            grey until a first pick. Color the options directly: real options
            readable, the placeholder row muted. */}
        {placeholder && (
          <option value="" disabled className="text-placeholder">
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="text-heading">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
