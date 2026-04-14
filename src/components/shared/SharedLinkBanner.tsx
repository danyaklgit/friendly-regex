import { Button } from './Button';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import type { ShareParams } from '../../utils/shareLink';

interface SharedLinkBannerProps {
  share: ShareParams;
  onDismiss: () => void;
}

function formatFilterKey(key: string): string {
  if (key.startsWith('data:')) return humanizeFieldName(key.slice(5));
  if (key === '__dates') return 'Dates';
  if (key === '__debit') return 'Debit Amount';
  if (key === '__credit') return 'Credit Amount';
  if (key === '__tags') return 'Tags';
  if (key.endsWith('_GTE')) return `${humanizeFieldName(key.replace(/_GTE$/, ''))} (min)`;
  if (key.endsWith('_LTE')) return `${humanizeFieldName(key.replace(/_LTE$/, ''))} (max)`;
  return humanizeFieldName(key);
}

export function SharedLinkBanner({ share, onDismiss }: SharedLinkBannerProps) {
  const filterEntries = Object.entries(share.filters).filter(([, v]) => v.size > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
      <div className="fixed inset-0 bg-black/10 dark:bg-black/40" onClick={onDismiss} />
      <div className="relative bg-surface-elevated rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <svg className="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <h2 className="text-lg font-semibold text-heading">Shared View</h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Shared by */}
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-body-secondary whitespace-nowrap">Shared by</span>
            <span className="text-sm font-semibold text-heading truncate">{share.sharedBy}</span>
          </div>

          {/* Note */}
          {share.note && (
            <div className="rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/15 px-3 py-2.5">
              <p className="text-xs font-medium text-body-secondary mb-0.5">Note</p>
              <p className="text-sm text-heading whitespace-pre-wrap">{share.note}</p>
            </div>
          )}

          {/* Filters */}
          {filterEntries.length > 0 && (
            <div>
              <p className="text-xs font-medium text-body-secondary mb-1.5">Filters</p>
              <div className="rounded-lg bg-surface-hover/50 px-3 py-2.5 space-y-1">
                {filterEntries.map(([key, values]) => (
                  <div key={key} className="flex items-baseline gap-1.5 text-xs">
                    <span className="font-medium text-body-secondary whitespace-nowrap">{formatFilterKey(key)}:</span>
                    <span className="text-body truncate">{[...values].join(', ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View settings */}
          {share.toggles && (
            <div>
              <p className="text-xs font-medium text-body-secondary mb-1.5">View settings</p>
              <div className="rounded-lg bg-surface-hover/50 px-3 py-2.5 space-y-1 text-xs">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-medium text-body-secondary">Compact mode:</span>
                  <span className="text-body">{share.toggles.compactMode ? 'on' : 'off'}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-medium text-body-secondary">Incremental pagination:</span>
                  <span className="text-body">{share.toggles.incrementalPagination ? 'on' : 'off'}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-medium text-body-secondary">Show attributes:</span>
                  <span className="text-body">{share.toggles.showAttributes ? 'on' : 'off'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex justify-end">
          <Button variant="primary" onClick={onDismiss}>View Transactions</Button>
        </div>
      </div>
    </div>
  );
}
