import { useState, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { buildShareUrl } from '../../utils/shareLink';
import type { ShareToggles } from '../../utils/shareLink';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

interface ShareLinkDialogProps {
  open: boolean;
  onClose: () => void;
  bank: string;
  side: string;
  filters: Record<string, Set<string>>;
  toggles: ShareToggles;
  sharedBy: string;
}

/** Produce a short human-readable summary of the active filters (excluding bank/side base). */
function summarizeFilters(filters: Record<string, Set<string>>): string[] {
  const lines: string[] = [];
  for (const [key, values] of Object.entries(filters)) {
    if (values.size === 0) continue;
    const label = key.startsWith('data:')
      ? humanizeFieldName(key.slice(5))
      : key === '__dates' ? 'Dates'
      : key === '__debit' ? 'Debit Amount'
      : key === '__credit' ? 'Credit Amount'
      : key === '__tags' ? 'Tags'
      : key.endsWith('_GTE') ? `${humanizeFieldName(key.replace(/_GTE$/, ''))} (min)`
      : key.endsWith('_LTE') ? `${humanizeFieldName(key.replace(/_LTE$/, ''))} (max)`
      : humanizeFieldName(key);
    const vals = [...values].join(', ');
    lines.push(`${label}: ${vals}`);
  }
  return lines;
}

export function ShareLinkDialog({ open, onClose, bank, side, filters, toggles, sharedBy }: ShareLinkDialogProps) {
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  // Reset note when dialog opens
  useEffect(() => {
    if (open) { setNote(''); setCopied(false); }
  }, [open]);

  const url = open
    ? buildShareUrl({ bank, side, filters, toggles, note: note.trim() || undefined, sharedBy })
    : '';

  const filterSummary = summarizeFilters(filters);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share Current View"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleCopy}>
            {copied ? (
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Link
              </span>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* URL field */}
        <div>
          <label className="block text-xs font-medium text-body mb-1 pl-1">Link</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              className="flex-1 block w-full rounded-lg border border-input-border bg-surface px-3 py-2 text-xs text-body-secondary font-mono truncate outline-none"
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>

        {/* Note textarea */}
        <div>
          <label className="block text-xs font-medium text-body mb-1 pl-1">
            Add a note <span className="text-faint font-normal">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for the recipient..."
            rows={3}
            maxLength={500}
            className="block w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors resize-none"
          />
        </div>

        {/* Filter & toggle summary */}
        {(filterSummary.length > 0 || toggles) && (
          <div className="rounded-lg bg-surface-hover/50 px-3 py-2.5 space-y-2">
            {filterSummary.length > 0 && (
              <div>
                <p className="text-xs font-medium text-body-secondary mb-1">Included filters</p>
                <ul className="space-y-0.5">
                  {filterSummary.map((line) => (
                    <li key={line} className="text-xs text-body-secondary truncate">{line}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-body-secondary mb-1">View settings</p>
              <ul className="space-y-0.5 text-xs text-body-secondary">
                <li>Compact mode: {toggles.compactMode ? 'on' : 'off'}</li>
                <li>Incremental pagination: {toggles.incrementalPagination ? 'on' : 'off'}</li>
                <li>Show attributes: {toggles.showAttributes ? 'on' : 'off'}</li>
              </ul>
            </div>
          </div>
        )}

        <p className="text-xs text-faint">
          This link includes the selected bank, side, filters, and view settings.
        </p>
      </div>
    </Modal>
  );
}
