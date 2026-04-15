import { Button } from './Button';
// import { ToggleBadge } from './ShareLinkDialog';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import type { ShareParams } from '../../utils/shareLink';
import { useTransactionData } from '../../hooks/useTransactionData';
import type { FilterDefinition } from '../../api/transactions';

interface SharedLinkBannerProps {
  share: ShareParams;
  onDismiss: () => void;
}

function formatFilterKey(key: string, defs: FilterDefinition[]): string {
  const defLabel = defs.find((d) => d.Tag === key)?.Label;
  if (defLabel) return defLabel;
  if (key.startsWith('data:')) return humanizeFieldName(key.slice(5));
  if (key === '__dates') return 'Dates';
  if (key === '__debit') return 'Debit Amount';
  if (key === '__credit') return 'Credit Amount';
  if (key === '__tags') return 'Tags';
  if (key.endsWith('_GTE')) return `${humanizeFieldName(key.replace(/_GTE$/, ''))} (min)`;
  if (key.endsWith('_LTE')) return `${humanizeFieldName(key.replace(/_LTE$/, ''))} (max)`;
  return humanizeFieldName(key);
}

/** Resolve a stored filter value to the human-readable Label used in the filter UI. Falls back to the raw value. */
function resolveValueLabel(key: string, value: string, defs: FilterDefinition[]): string {
  if (!defs.length) return value;
  if (key.startsWith('__') || key.endsWith('_GTE') || key.endsWith('_LTE')) return value;
  const column = key.startsWith('data:') ? key.slice(5) : key;
  const def = defs.find(
    (d) => d.Tag === key || d.Tag === column || d.Values.some((v) => v.Column === column),
  );
  const match = def?.Values.find((v) => v.Column === value || v.Value === value);
  return match?.Label ?? value;
}

export function SharedLinkBanner({ share, onDismiss }: SharedLinkBannerProps) {
  const { filterDefinitions } = useTransactionData();
  const filterEntries = Object.entries(share.filters).filter(([, v]) => v.size > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
      <div className="fixed inset-0 bg-black/10 dark:bg-black/40" onClick={onDismiss} />
      <div className="relative bg-surface-elevated rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <svg className="w-5 h-5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <h2 className="text-lg font-semibold text-heading">Shared View</h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Shared by */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">Shared by</p>
            <p className="text-sm font-semibold text-heading truncate">{share.sharedBy}</p>
          </div>

          {/* Note */}
          {share.note && (
            <div className="border-t border-border-subtle pt-3 space-y-1">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">Note</p>
              <p className="text-sm text-heading whitespace-pre-wrap wrap-break-word max-h-32 overflow-y-auto custom-scrollbar pr-1">
                {share.note}
              </p>
            </div>
          )}

          {/* Filters */}
          {filterEntries.length > 0 && (
            <div className="border-t border-border-subtle pt-3 space-y-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">Filters</p>
              <div className="flex flex-wrap gap-1.5">
                {filterEntries.map(([key, values]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary-dark text-xs px-2.5 py-1 rounded-lg max-w-full"
                  >
                    <span className="font-medium shrink-0">{formatFilterKey(key, filterDefinitions)}:</span>
                    <span className="truncate">
                      {[...values].map((v) => resolveValueLabel(key, v, filterDefinitions)).join(', ')}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* View settings */}
          {/* {share.toggles && (
            <div className="border-t border-border-subtle pt-3 space-y-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">View settings</p>
              <div className="flex flex-wrap gap-1.5">
                <ToggleBadge label="Compact mode" checked={share.toggles.compactMode} />
                <ToggleBadge label="Incremental pagination" checked={share.toggles.incrementalPagination} />
                <ToggleBadge label="Show attributes" checked={share.toggles.showAttributes} />
              </div>
            </div>
          )} */}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex justify-end">
          <Button variant="primary" onClick={onDismiss}>View Transactions</Button>
        </div>
      </div>
    </div>
  );
}
