interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'lg';
  disabled?: boolean;
}

export function Toggle({ label, checked, onChange, size = 'sm', disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
        ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
        ${checked
          ? 'bg-primary/10 border-primary/30 text-primary-dark dark:text-primary shadow-sm'
          : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        } ${size === 'lg' ? 'py-2 text-sm' : ''}`}
    >
      <span
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0
          ${checked ? 'bg-primary' : 'bg-border-strong dark:bg-faint'}`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform
            ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`}
        />
      </span>
      {label}
    </button>
  );
}
