import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700 pl-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
          placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors ${className}`}
        {...props}
      />
    </div>
  );
}
