import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TagSpecCommentTarget } from '../../types/comments';
import { getTargetLevel } from '../../utils/commentTarget';
import { CommentThreadPanelBody } from './CommentThreadPanelBody';

interface CommentThreadPanelProps {
  open: boolean;
  target: TagSpecCommentTarget | null;
  targetLabel?: string;
  authToken: string | null;
  onClose: () => void;
  /** When set, the panel header shows a link that navigates the user to the
   *  Backlog row this thread is attached to. The panel closes after. */
  onNavigateToBacklog?: (target: TagSpecCommentTarget) => void;
  /** When set (e.g. when opened from a notification), the thread item whose
   *  Id matches is scrolled into view and briefly highlighted. */
  focusCommentId?: string | null;
  /** When the notification points at a reply rather than the parent comment,
   *  highlight that specific reply instead of the whole thread. */
  focusReplyId?: string | null;
}

function levelLabel(target: TagSpecCommentTarget): string {
  const level = getTargetLevel(target);
  switch (level) {
    case 'library':
      return 'Bank / Side';
    case 'definition':
      return 'TagSpec';
    case 'rule':
      return 'Rule expression';
    case 'attribute':
      return 'Attribute';
  }
}

export function CommentThreadPanel({
  open,
  target,
  targetLabel,
  authToken,
  onClose,
  onNavigateToBacklog,
  focusCommentId,
  focusReplyId,
}: CommentThreadPanelProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const focusedOnceRef = useRef(false);

  // Focus the close button exactly once when the panel opens. Splitting from
  // the keydown effect so future ref-changes don't yank focus away from
  // whatever the user is typing into.
  useEffect(() => {
    if (!open) {
      focusedOnceRef.current = false;
      return;
    }
    if (!focusedOnceRef.current) {
      focusedOnceRef.current = true;
      closeBtnRef.current?.focus();
    }
  }, [open]);

  // Escape closes — depends on onClose only.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const panel = (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        role="dialog"
        aria-label="Comment thread"
        aria-hidden={!open}
        data-tour="comment-thread-panel"
        className={`fixed inset-y-0 right-0 z-[70] w-full md:w-[44%] lg:w-[38%] max-w-[640px] bg-surface-elevated border-l border-border shadow-[-24px_0_48px_-12px_rgba(15,23,42,0.45)] flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-[calc(100%+80px)]'
        }`}
      >
        <header className="sticky top-0 z-10 bg-surface-elevated border-b border-border px-5 py-3.5 flex items-start gap-3">
          <div className="flex-1 min-w-0 text-center">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-faint uppercase">
              Comments
            </div>
            <div className="text-sm font-medium text-body truncate">
              {target ? levelLabel(target) : ''}
              {targetLabel ? ` · ${targetLabel}` : ''}
            </div>
            {onNavigateToBacklog && target && (
              <button
                type="button"
                onClick={() => {
                  onNavigateToBacklog(target);
                  onClose();
                }}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300 hover:underline cursor-pointer"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M5 3h6a1 1 0 0 1 1 1v6M11 3l-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                View in Backlog
              </button>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            data-tour="comment-thread-close"
            onClick={onClose}
            aria-label="Close comment panel"
            className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-body cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <CommentThreadPanelBody
            open={open}
            target={target}
            authToken={authToken}
            focusCommentId={focusCommentId}
            focusReplyId={focusReplyId}
          />
        </div>
      </aside>
    </>
  );

  // Portal to <body> so we escape any ancestor stacking context (table rows,
  // sticky headers, modal scroll containers).
  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
}
