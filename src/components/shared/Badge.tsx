interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'emerald' | 'red' | 'amber' | 'violet' | 'gray';
  size?: 'xs' | 'sm';
  className?: string;
}

const variantClasses: Record<string, string> = {
  default: 'bg-surface-tertiary text-body-secondary',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  primary: 'bg-primary text-white dark:bg-primary/50 dark:text-cyan-50',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-50 dark:text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  violet: 'bg-violet-50 text-violet-700',
  gray: 'bg-gray-100 text-gray-600',
};

const sizeClasses: Record<string, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
};

export function Badge({ children, variant = 'default', size = 'sm', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold whitespace-nowrap ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
