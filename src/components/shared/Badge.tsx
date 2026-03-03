interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const variantClasses: Record<string, string> = {
  default: 'bg-surface-tertiary text-body',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
};

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}
