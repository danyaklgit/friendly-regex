import { useEffect, useRef } from 'react';
import type { CurationSummary } from '../../api/sampling';
import { KeyTokenChips } from '../transactions/KeyTokenChips';
import { Button } from '../shared/Button';

interface CurationsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Newest first (GetCurations order); null = still loading. */
  curations: CurationSummary[] | null;
  /** Gated like rule editing — only the checked-out operator edits/deletes. */
  canEdit: boolean;
  onOpenInStudio: (c: CurationSummary) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

/**
 * "Curations" drawer (Curation Studio, 2026-09-08 — supersedes the Key rules
 * drawer): every stored curation / key edit of the checked-out workspace. A
 * curation keeps living here even when it currently has no untagged matches
 * (exhausted) — it revives in the Curated View whenever new matching
 * transactions arrive. Open in studio to reshape it; Delete returns its rows
 * to their automatic keys at the run that starts.
 */
export function CurationsPanel({ open, onClose, curations, canEdit, onOpenInStudio, onDelete, deletingId }: CurationsPanelProps) {
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
        aria-label="Curations"
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
                Curations{curations ? ` (${curations.length})` : ''}
              </div>
              <p className="mt-1 text-xs text-body-secondary">
                Saved curations and key edits of this workspace. Each survives every resample until it is deleted, and
                revives whenever new matching transactions arrive.
              </p>
            </div>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              className="text-faint hover:text-body-secondary transition-colors p-1 shrink-0"
              aria-label="Close curations panel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-3">
          {curations === null ? (
            <p className="text-xs text-faint italic animate-pulse">Loading curations…</p>
          ) : curations.length === 0 ? (
            <p className="text-xs text-muted italic">No curations in this workspace yet — right-click a transaction and pick "Create curation".</p>
          ) : (
            curations.map((c) => (
              <div key={c.Id} className="rounded-lg border border-border bg-surface px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {c.Name ? (
                    <span className="text-xs font-semibold text-heading min-w-0 truncate">{c.Name}</span>
                  ) : (
                    <span className="text-xs font-medium text-body-secondary italic">Key edit (unnamed)</span>
                  )}
                  <span className="text-[10px] text-body-secondary whitespace-nowrap tabular-nums">
                    {c.OpenMatches.toLocaleString()} open match{c.OpenMatches === 1 ? '' : 'es'}
                  </span>
                  {c.IsExhausted && (
                    <span
                      className="inline-flex items-center rounded-full border border-border-strong bg-surface-secondary px-1.5 py-px text-[9px] font-semibold text-body-secondary whitespace-nowrap"
                      title="No untagged matches right now — the curation stays stored and comes back when matching transactions arrive."
                    >
                      dormant
                    </span>
                  )}
                  {(c.Sets ?? []).flatMap((s) => s.TransactionTypeCodes ?? []).filter((v, i, a) => a.indexOf(v) === i).map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center rounded border border-border-strong bg-surface px-1.5 py-px text-[9px] font-mono font-semibold text-body-secondary whitespace-nowrap"
                    >
                      {code}
                    </span>
                  ))}
                </div>
                <KeyTokenChips tokens={c.Tokens ?? []} size="xs" />
                {c.SourceAnchor && (
                  <p dir="auto" className="text-[10px] text-faint font-mono truncate" title={c.SourceAnchor}>
                    was {c.SourceAnchor}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] text-body-secondary min-w-0 truncate">
                    {c.UpdatedByUserId || c.CreatedByUserId}
                    {' · '}
                    {new Date(c.UpdatedAtUtc || c.CreatedAtUtc).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {c.Note ? ` · ${c.Note}` : ''}
                  </span>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenInStudio(c)}
                      className="text-[10px] font-medium text-primary hover:underline cursor-pointer"
                    >
                      {canEdit ? 'Open in studio' : 'View in studio'}
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onDelete(c.Id)}
                        disabled={deletingId != null}
                        className="text-[10px] font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {deletingId === c.Id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </span>
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
