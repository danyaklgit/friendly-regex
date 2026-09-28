export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group (not rendered as visible text). */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'xs' | 'sm';
  disabled?: boolean;
}

/**
 * Exclusive button group (Day / Week / Month / Year, Operator view / Published,
 * Coverage / Team activity, Chart / Table). Styled like the shared Toggle's
 * checked state so it sits naturally in the filter rows.
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange, size = 'xs', disabled }: SegmentedControlProps<T>) {
  const pad = size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-lg border border-border-strong bg-surface p-0.5 ${disabled ? 'opacity-60' : ''}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            disabled={disabled}
            onClick={() => { if (!disabled) onChange(option.value); }}
            className={`${pad} rounded-md font-medium whitespace-nowrap transition-colors
              ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
              ${active ? 'bg-primary/10 text-primary-dark dark:text-primary shadow-sm' : 'text-body hover:bg-surface-hover'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
