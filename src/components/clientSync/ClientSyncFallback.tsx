/** Skeleton for the Client Sync tab: shown while the lazy chunk loads and on the first summary fetch. */
export function ClientSyncFallback() {
  return (
    <div role="status" aria-label="Loading client sync" className="animate-pulse space-y-3">
      <div className="h-12 rounded-lg bg-surface-tertiary" />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-lg bg-surface-tertiary" />)}
      </div>
      <div className="h-40 rounded-lg bg-surface-tertiary" />
      <div className="h-72 rounded-lg bg-surface-tertiary" />
    </div>
  );
}
