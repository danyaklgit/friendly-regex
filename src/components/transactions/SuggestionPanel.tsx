import { useEffect, useRef, useState } from 'react';
import type { SuggestedTagSpec } from '../../api/sampling';
import { CONFIDENCE_DISPLAY, confidenceChipClass } from '../../utils/curatedView';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface SuggestionPanelProps {
  /** The suggestion to show; null closes the drawer. */
  suggestion: SuggestedTagSpec | null;
  onClose: () => void;
  /** Accept the draft: marks it Accepted server-side and opens the rule
   *  builder pre-filled. Disabled (with reason) when saving isn't possible. */
  onAccept: (s: SuggestedTagSpec) => void;
  onReject: (s: SuggestedTagSpec) => void;
  canAccept: boolean;
  acceptDisabledReason?: string;
  busy?: boolean;
}

/**
 * Right-side drawer for one curated-view rule suggestion (Smart Sampling
 * Engine, 2026-09-03). Modeled on TagDetailPanel's shell. Shows the draft
 * rule, the confidence wording, "represents N", real example texts (verbatim
 * whitespace — gotcha #29 — and dir="auto" for Arabic narratives), warnings,
 * and for multi-tag sets the conflicting tags instead of a draft. Reject asks
 * for confirmation; UNUSABLE suggestions never reach this panel.
 */
export function SuggestionPanel({ suggestion, onClose, onAccept, onReject, canAccept, acceptDisabledReason, busy }: SuggestionPanelProps) {
  const open = !!suggestion;
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset the pending confirm when the target suggestion changes/closes.
  useEffect(() => { setConfirmReject(false); }, [suggestion?.Id]);

  const s = suggestion;
  const isConflict = s?.MatchKind === 'MultiTag';
  const rules = s?.SuggestedDefinition?.TagRuleExpressions?.[0] ?? [];
  const examples = (s?.ExampleTexts ?? []).slice(0, 3);
  const warnings = s?.Warnings ?? [];
  const chipLabel = s && s.Confidence !== 'UNUSABLE' ? CONFIDENCE_DISPLAY[s.Confidence] : '';

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
        aria-label="Rule suggestion"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-40 bg-surface-elevated border-l border-border shadow-[-24px_0_48px_-12px_rgba(15,23,42,0.45)] flex flex-col transition-transform duration-300 ease-out w-full md:w-[min(44vw,640px)] lg:w-[min(38vw,640px)] ${
          open ? 'translate-x-0' : 'translate-x-[calc(100%+80px)]'
        }`}
      >
        <div className={`absolute inset-y-0 left-0 w-[3px] ${isConflict ? 'bg-red-500' : 'bg-primary'}`} aria-hidden />

        {s && (
          <>
            <header className="sticky top-0 z-10 bg-surface-elevated border-b border-border px-6 pt-5 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold tracking-[0.18em] text-faint uppercase mb-1">
                    {isConflict ? 'Conflicting rules' : 'Suggested rule'}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {chipLabel && (
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${confidenceChipClass(s.Confidence)}`}>
                        {chipLabel}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-heading">
                      Represents {s.CoverageCount.toLocaleString()} transaction{s.CoverageCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {s.Mode === 'Extend' && s.BaseTag && (
                    <p className="mt-1.5 text-xs text-body-secondary">
                      Extends the existing tag{' '}
                      <span className="font-medium text-heading">{s.BaseTag}</span>
                      {' '}— its rules already cover this set's neighbours.
                    </p>
                  )}
                </div>
                <button
                  ref={closeBtnRef}
                  onClick={onClose}
                  className="text-faint hover:text-body-secondary transition-colors p-1 shrink-0"
                  aria-label="Close suggestion panel"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-5">
              {isConflict ? (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1.5">Conflicting tags</p>
                  <p className="text-xs text-body-secondary mb-2">
                    Several rules currently match this set's rows. Tighten one of these rules so only one applies.
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(s.ConflictingTags ?? []).map((tag) => (
                      <span key={tag} className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800">
                        {tag}
                      </span>
                    ))}
                  </div>
                </section>
              ) : (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1.5">Draft rule</p>
                  {s.SuggestedDefinition?.Nickname && (
                    <p className="mb-1.5">
                      <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary-dark dark:text-primary">
                        {s.SuggestedDefinition.Nickname}
                      </span>
                    </p>
                  )}
                  {rules.length > 0 ? (
                    <div className="space-y-1.5">
                      {rules.map((expr, i) => (
                        <div key={i} className="rounded-lg border border-border bg-surface px-3 py-2">
                          <p className="text-[10px] text-muted mb-0.5">{expr.SourceField}</p>
                          {/* Verbatim whitespace + per-value direction: narrative
                              regexes split on exact space runs and mix Arabic. */}
                          <code dir="auto" className="block text-xs text-heading whitespace-pre-wrap break-all font-mono">
                            {expr.Regex}
                          </code>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted italic">Context-only draft (no rule expressions).</p>
                  )}
                </section>
              )}

              {warnings.length > 0 && (
                <section className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 space-y-1">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                      <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                      </svg>
                      <span>{w}</span>
                    </p>
                  ))}
                </section>
              )}

              {examples.length > 0 && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1.5">
                    Example transactions from this set
                  </p>
                  <div className="space-y-1.5">
                    {examples.map((text, i) => (
                      <div key={i} dir="auto" className="rounded-lg border border-border-subtle bg-surface-secondary/60 px-3 py-2 text-xs text-body whitespace-pre-wrap break-all font-mono">
                        {text}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {s.StructuralAnchor && !isConflict && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1">Structural anchor</p>
                  <code dir="auto" className="text-[11px] text-body-secondary whitespace-pre-wrap break-all font-mono">{s.StructuralAnchor}</code>
                </section>
              )}
            </div>

            <footer className="border-t border-border px-6 py-4 flex items-center justify-end gap-3 bg-surface-elevated">
              <Button variant="outline" onClick={() => setConfirmReject(true)} disabled={busy}>
                Reject
              </Button>
              {!isConflict && (
                <span title={!canAccept ? (acceptDisabledReason ?? 'Check out this workspace to accept a draft rule.') : undefined}>
                  <Button variant="primary" onClick={() => onAccept(s)} disabled={!canAccept || busy} loading={busy}>
                    Accept — open in Rule Builder
                  </Button>
                </span>
              )}
            </footer>

            <ConfirmDialog
              open={confirmReject}
              onClose={() => setConfirmReject(false)}
              onConfirm={() => { setConfirmReject(false); onReject(s); }}
              title="Reject this suggestion?"
              message={`The draft covering ${s.CoverageCount.toLocaleString()} transaction${s.CoverageCount === 1 ? '' : 's'} will be marked rejected and leave the pending list. The transactions themselves are not touched.`}
              confirmLabel="Reject suggestion"
              variant="danger"
            />
          </>
        )}
      </aside>
    </>
  );
}
