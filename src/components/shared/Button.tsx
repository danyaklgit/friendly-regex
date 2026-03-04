import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'danger_ghost' | 'ghost';
  size?:  'xs' | 'sm' | 'md';
}

const variantClasses: Record<string, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark shadow-sm',
  secondary: 'bg-surface text-body border border-border-strong hover:bg-surface-hover shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  danger_ghost: 'text-red-600 bg-red-50 hover:bg-red-100 border border-red-300 hover:bg-red-50 hover:border-red-400',
  ghost: 'text-body-secondary hover:text-heading hover:bg-surface-active',
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
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]} ${sizeClasses[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}`}
      disabled={disabled}
      {...props}
    />
  );
}
