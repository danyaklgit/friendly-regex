import { Button } from '../shared/Button';

/** Inline failure card for a report fetch error (spec 7.9); shared by both sub-views. */
export function ReportErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-300 dark:border-rose-400/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-xs text-red-700 dark:text-rose-200">
      <span>{`Could not load the report: ${message}`}</span>
      <Button variant="secondary" size="xs" onClick={onRetry}>Retry</Button>
    </div>
  );
}
