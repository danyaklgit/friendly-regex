import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'danger_ghost' | 'ghost' | 'outline';
  size?:  'xs' | 'sm' | 'md';
  /** When true, renders an inline spinner before the label and disables the button. */
  loading?: boolean;
}

const variantClasses: Record<string, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark shadow-sm',
  secondary: 'bg-surface text-body border border-border-strong hover:bg-surface-hover shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  danger_ghost: 'text-red-600 bg-red-50 hover:bg-red-100 border border-red-300 hover:bg-red-50 hover:border-red-400',
  ghost: 'text-body-secondary hover:text-heading hover:bg-surface-active',
  outline: 'border border-primary text-primary-dark hover:bg-primary/10 dark:text-primary-light dark:hover:bg-primary/15',
};

const sizeClasses: Record<string, string> = {
  xs: 'px-3 p-1.5 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  disabled,
  loading,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]} ${sizeClasses[size]}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}`}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <svg
          className="w-3.5 h-3.5 animate-spin shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
