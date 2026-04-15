import { useState, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { buildShareUrl } from '../../utils/shareLink';
import type { ShareToggles } from '../../utils/shareLink';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

const NOTE_MAX_LENGTH = 500;

interface ShareLinkDialogProps {
  open: boolean;
  onClose: () => void;
  bank: string;
  side: string;
  filters: Record<string, Set<string>>;
  toggles: ShareToggles;
  sharedBy: string;
}

interface FilterSummaryEntry {
  label: string;
  values: string[];
}

/** Produce a structured summary of the active filters (excluding bank/side base). */
function summarizeFilters(filters: Record<string, Set<string>>): FilterSummaryEntry[] {
  const entries: FilterSummaryEntry[] = [];
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
    entries.push({ label, values: [...values] });
  }
  return entries;
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
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-primary uppercase tracking-wide">Link</label>
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
        <div className="border-t border-border-subtle pt-3 space-y-2">
          <label className="block text-xs font-semibold text-primary uppercase tracking-wide">
            Add a note <span className="text-faint font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <div className="relative">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context for the recipient..."
              rows={3}
              maxLength={NOTE_MAX_LENGTH}
              className="block w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 pb-5 text-sm text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors resize-none"
            />
            <span
              className={`pointer-events-none absolute bottom-1.5 right-2.5 text-[10px] font-mono tabular-nums transition-colors
                ${note.length === 0
                  ? 'text-faint'
                  : note.length >= NOTE_MAX_LENGTH
                    ? 'text-primary-dark font-semibold'
                    : 'text-body-secondary'
                }`}
              aria-live="polite"
            >
              {note.length}/{NOTE_MAX_LENGTH}
            </span>
          </div>
        </div>

        {/* Filter & toggle summary */}
        {filterSummary.length > 0 && (
          <div className="border-t border-border-subtle pt-3 space-y-2">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">Included filters</p>
            <div className="flex flex-wrap gap-1.5">
              {filterSummary.map(({ label, values }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary-dark text-xs px-2.5 py-1 rounded-lg max-w-full"
                >
                  <span className="font-medium shrink-0">{label}:</span>
                  <span className="truncate">{values.join(', ')}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {toggles && (
          <div className="border-t border-border-subtle pt-3 space-y-2">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">View settings</p>
            <div className="flex flex-wrap gap-1.5">
              <ToggleBadge label="Compact mode" checked={toggles.compactMode} />
              <ToggleBadge label="Incremental pagination" checked={toggles.incrementalPagination} />
              <ToggleBadge label="Show attributes" checked={toggles.showAttributes} />
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

/** Read-only visual badge mirroring the Toggle component's aesthetic — shows on/off state for a setting. */
export function ToggleBadge({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium border
        ${checked
          ? 'bg-primary/10 border-primary/30 text-primary-dark dark:text-primary'
          : 'bg-surface border-border-strong text-body-secondary'
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
    </span>
  );
}
