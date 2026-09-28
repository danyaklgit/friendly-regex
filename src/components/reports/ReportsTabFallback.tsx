/** Skeleton for the Reports tab: shown while the lazy chunk loads and on a view's first fetch. */
export function ReportsTabFallback() {
  return (
    <div role="status" aria-label="Loading report" className="animate-pulse space-y-3">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-surface-tertiary" />)}
      </div>
      <div className="h-72 rounded-lg bg-surface-tertiary" />
      <div className="h-72 rounded-lg bg-surface-tertiary" />
    </div>
  );
}
