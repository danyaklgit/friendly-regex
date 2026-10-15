import type { ReactNode } from 'react';

interface TraceStepProps {
  number: number;
  title: string;
  /** Status badge(s) next to the title. */
  badge?: ReactNode;
  /** The first call's time. */
  time?: string;
  children: ReactNode;
}

/** One numbered step of the trace timeline. */
export function TraceStep({ number, title, badge, time, children }: TraceStepProps) {
  return (
    <section aria-label={`${number}. ${title}`} className="relative pl-8">
      <span aria-hidden className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary-dark dark:text-primary">
        {number}
      </span>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-heading">{title}</h3>
        {badge}
        {time && <span className="font-mono text-[11px] text-muted">{time}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
