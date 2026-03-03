import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: boolean;
}

export function Input({ label, className = '', id, error, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  const borderClass = error
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
    : 'border-input-border focus:border-primary focus:ring-primary';
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-body pl-1">
          {label}{props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={`block w-full rounded-lg border ${borderClass} bg-input-bg px-3 py-2 text-sm text-heading
          placeholder:text-placeholder focus:ring-1 outline-none transition-colors ${className}`}
        {...props}
      />
    </div>
  );
}
