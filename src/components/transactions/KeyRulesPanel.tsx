import { useEffect, useRef } from 'react';
import type { KeyOverride } from '../../api/sampling';
import { KeyTokenChips } from './KeyTokenChips';
import { Button } from '../shared/Button';

interface KeyRulesPanelProps {
  open: boolean;
  onClose: () => void;
  /** Newest first (GetKeyEdits order); null = still loading. */
  edits: KeyOverride[] | null;
  /** Gated like rule editing — only the checked-out operator deletes. */
  canEdit: boolean;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

/**
 * "Key rules" drawer (matching-keys delta, 2026-09-07): every matching-key
 * edit stored for the checked-out workspace — the corrected key as chips,
 * "was <automatic key>", author / date / note, and Return to automatic key
 * (DeleteKeyEdit → the same regroup flow as Apply). Edits survive every
 * resample until removed here or from the suggestion drawer.
 */
export function KeyRulesPanel({ open, onClose, edits, canEdit, onDelete, deletingId }: KeyRulesPanelProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        role="dialog"
        aria-label="Key rules"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-40 bg-surface-elevated border-l border-border shadow-[-24px_0_48px_-12px_rgba(15,23,42,0.45)] flex flex-col transition-transform duration-300 ease-out w-full md:w-[min(44vw,640px)] lg:w-[min(38vw,640px)] ${
          open ? 'translate-x-0' : 'translate-x-[calc(100%+80px)]'
        }`}
      >
        <div className="absolute inset-y-0 left-0 w-[3px] bg-primary" aria-hidden />

        <header className="sticky top-0 z-10 bg-surface-elevated border-b border-border px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.18em] text-faint uppercase mb-1">Curated view</div>
              <div className="text-sm font-semibold text-heading">
                Key rules{edits ? ` (${edits.length})` : ''}
              </div>
              <p className="mt-1 text-xs text-body-secondary">
                Matching-key corrections for this workspace. Each one survives every resample until it is removed.
              </p>
            </div>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              className="text-faint hover:text-body-secondary transition-colors p-1 shrink-0"
              aria-label="Close key rules panel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-3">
          {edits === null ? (
            <p className="text-xs text-faint italic animate-pulse">Loading key edits…</p>
          ) : edits.length === 0 ? (
            <p className="text-xs text-muted italic">No key edits in this workspace.</p>
          ) : (
            edits.map((o) => (
              <div key={o.Id} className="rounded-lg border border-border bg-surface px-3 py-2.5 space-y-1.5">
                <KeyTokenChips tokens={o.Tokens ?? []} size="xs" />
                {o.Anchored != null && (
                  <p className="text-[10px] text-faint">
                    {o.Anchored ? 'Starts with — the key sits at the start of its field' : 'Contains — the key may appear anywhere in its field'}
                  </p>
                )}
                {o.SourceAnchor && (
                  <p dir="auto" className="text-[10px] text-faint font-mono truncate" title={o.SourceAnchor}>
                    was {o.SourceAnchor}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] text-body-secondary min-w-0 truncate">
                    {o.CreatedByUserId}
                    {' · '}
                    {new Date(o.CreatedAtUtc).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {o.Note ? ` · ${o.Note}` : ''}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onDelete(o.Id)}
                      disabled={deletingId != null}
                      className="text-[10px] font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {deletingId === o.Id ? 'Removing…' : 'Return to automatic key'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="border-t border-border px-6 py-4 flex items-center justify-end bg-surface-elevated">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </footer>
      </aside>
    </>
  );
}
