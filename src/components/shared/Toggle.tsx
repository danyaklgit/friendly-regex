interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer border
        ${checked
          ? 'bg-primary/10 border-primary/30 text-primary-dark dark:text-primary shadow-sm'
          : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
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
