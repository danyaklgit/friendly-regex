import { Tooltip } from '../shared/Tooltip';

interface HintsInfoIconProps {
  hints: string[];
}

export function HintsInfoIcon({ hints }: HintsInfoIconProps) {
  if (hints.length === 0) return null;

  const content = (
    <div className="max-w-xs">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1">Hints</p>
      <ul className="space-y-0.5">
        {hints.map((hint, i) => (
          <li key={i} className="text-xs flex items-start gap-1.5">
            <span aria-hidden className="text-faint mt-0.5">·</span>
            <span>{hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <Tooltip content={content} placement="top">
      <button
        type="button"
        aria-label="View hints"
        onClick={(e) => e.preventDefault()}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-faint hover:text-primary transition-colors cursor-help shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </Tooltip>
  );
}
