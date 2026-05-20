import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useComments, useThread } from '../../context/CommentsContext';
import { useCommentPermission } from '../../hooks/useCommentPermission';
import { useAuth } from '../../context/AuthContext';
import type { TagSpecComment, TagSpecCommentTarget } from '../../types/comments';
import { getTargetLevel } from '../../utils/commentTarget';
import { flattenReplies } from '../../utils/replyTree';
import { CommentComposer } from './CommentComposer';
import { ThreadItem } from './ThreadItem';

interface CommentThreadPanelProps {
  open: boolean;
  target: TagSpecCommentTarget | null;
  targetLabel?: string;
  authToken: string | null;
  onClose: () => void;
  /** When set, the panel header shows a link that navigates the user to the
   *  Backlog row this thread is attached to. The panel closes after. */
  onNavigateToBacklog?: (target: TagSpecCommentTarget) => void;
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

/** Latest reply status — used to mark a thread as resolved. We flatten any
 *  nested replies and pick the chronologically most-recent one. */
function isResolved(comment: TagSpecComment): boolean {
  const replies = flattenReplies(comment.Replies);
  if (replies.length === 0) return false;
  const sorted = [...replies].sort((a, b) =>
    (a.CreationDate ?? '').localeCompare(b.CreationDate ?? ''),
  );
  const last = sorted[sorted.length - 1];
  return (last.Status ?? '').toUpperCase() === 'RESOLVED';
}

export function CommentThreadPanel({
  open,
  target,
  targetLabel,
  authToken,
  onClose,
  onNavigateToBacklog,
}: CommentThreadPanelProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const focusedOnceRef = useRef(false);
  const { libraryId, addComment, refresh, loading, error } = useComments();
  const { canComment, reason } = useCommentPermission(libraryId);
  const { isAudit } = useAuth();
  const threadAll = useThread(target ?? { TagSpecLibraryId: '' });
  const [showResolved, setShowResolved] = useState(false);

  // Focus the close button exactly once when the panel opens. Splitting from
  // the keydown/load effects so future ref-changes don't yank focus away from
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

  // Escape closes — depends on onClose only, not on ensureLoaded.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Refetch comments every time the panel opens so other users' replies
  // (especially ones that move a thread between active/resolved) show up
  // immediately instead of waiting for the page to remount.
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const { active, resolved } = useMemo(() => {
    const a: TagSpecComment[] = [];
    const r: TagSpecComment[] = [];
    for (const c of threadAll) (isResolved(c) ? r : a).push(c);
    const byDateDesc = (x: TagSpecComment, y: TagSpecComment) =>
      (y.CreationDate ?? '').localeCompare(x.CreationDate ?? '');
    a.sort(byDateDesc);
    r.sort(byDateDesc);
    return { active: a, resolved: r };
  }, [threadAll]);

  const handlePost = async (body: string, mentionIds: string[]) => {
    if (!target) return;
    await addComment(target, body, mentionIds);
  };

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
          {isAudit ? (
            <div className="text-center mt-12 px-6">
              <p className="text-sm font-medium text-body">Comments unavailable</p>
              <p className="text-xs text-muted mt-1">
                Audit users cannot view or post TagSpec comments.
              </p>
            </div>
          ) : (
            <>
          {target && (
            <section>
              {canComment ? (
                <CommentComposer authToken={authToken} onSubmit={handlePost} />
              ) : (
                <p className="text-[11px] text-muted bg-surface rounded-md border border-border px-3 py-2">
                  {reason ?? 'You cannot post a new comment here.'} You can still reply to existing threads below.
                </p>
              )}
            </section>
          )}

          {loading && threadAll.length === 0 && (
            <p className="text-center text-xs text-muted mt-12">Loading comments…</p>
          )}
          {error && <p className="text-center text-xs text-rose-600 mt-4">{error}</p>}

          {!loading && active.length === 0 && resolved.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center mt-16 px-6">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-faint mb-3"
                aria-hidden
              >
                <path
                  d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-sm font-medium text-body">No comments yet</p>
              <p className="text-xs text-muted mt-1">
                {canComment
                  ? 'Be the first to leave a comment on this item.'
                  : 'Once someone leaves a comment here, it will show up in this panel.'}
              </p>
            </div>
          )}

          {active.length > 0 && (
            <ol className="space-y-3">
              {active.map((c) => (
                <li key={c.Id}>
                  <ThreadItem comment={c} authToken={authToken} />
                </li>
              ))}
            </ol>
          )}

          {resolved.length > 0 && (
            <section className="pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowResolved((s) => !s)}
                className="text-[11px] font-medium text-muted hover:text-body cursor-pointer mb-2"
              >
                {showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})
              </button>
              {showResolved && (
                <ol className="space-y-3">
                  {resolved.map((c) => (
                    <li key={c.Id}>
                      <ThreadItem comment={c} authToken={authToken} resolved defaultCollapsed />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
            </>
          )}
        </div>
      </aside>
    </>
  );

  // Portal to <body> so we escape any ancestor stacking context (table rows,
  // sticky headers, modal scroll containers) — without this the Backlog
  // table's sticky <thead z-20> can show through the panel.
  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
}
