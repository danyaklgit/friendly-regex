import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: boolean;
  /** Optional element rendered inline to the right of the label text (e.g. an info-icon tooltip). */
  labelAdornment?: ReactNode;
}

export function Input({ label, className = '', id, error, labelAdornment, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  const borderClass = error
    ? 'border-red-400 dark:border-rose-400 focus:border-red-500 focus:ring-red-500'
    : 'border-input-border focus:border-primary focus:ring-primary';
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="flex items-center gap-1 pl-1">
          <label htmlFor={inputId} className="text-xs font-medium text-body">
            {label}{props.required && <span className="text-red-500 dark:text-rose-300 ml-0.5">*</span>}
          </label>
          {labelAdornment}
        </div>
      )}
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error || undefined}
          className={`block w-full rounded-lg border ${borderClass} bg-input-bg px-3 py-2 ${error ? 'pr-9' : ''} text-sm text-heading
            placeholder:text-placeholder focus:ring-1 outline-none transition-colors ${className}`}
          {...props}
        />
        {error && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-red-500 dark:text-rose-300 text-base font-bold leading-none"
            title="Invalid value"
          >
            !
          </span>
        )}
      </div>
    </div>
  );
}
