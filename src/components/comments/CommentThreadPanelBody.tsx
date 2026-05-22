import { useEffect, useMemo, useState } from 'react';
import { useComments, useThread } from '../../context/CommentsContext';
import { useCommentPermission } from '../../hooks/useCommentPermission';
import { useAuth } from '../../context/AuthContext';
import type { TagSpecComment, TagSpecCommentTarget } from '../../types/comments';
import { flattenReplies } from '../../utils/replyTree';
import { CommentComposer } from './CommentComposer';
import { ThreadItem } from './ThreadItem';

interface CommentThreadPanelBodyProps {
  open: boolean;
  target: TagSpecCommentTarget | null;
  authToken: string | null;
  /** When set, the thread item whose Id matches is scrolled into view and
   *  briefly highlighted. */
  focusCommentId?: string | null;
  /** When set, the reply with this id inside the focused comment is
   *  highlighted instead of the parent comment. */
  focusReplyId?: string | null;
}

/** Latest reply status — used to mark a thread as resolved. Flattens nested
 *  replies and picks the chronologically most recent one. */
function isResolved(comment: TagSpecComment): boolean {
  const replies = flattenReplies(comment.Replies);
  if (replies.length === 0) return false;
  const sorted = [...replies].sort((a, b) =>
    (a.CreationDate ?? '').localeCompare(b.CreationDate ?? ''),
  );
  const last = sorted[sorted.length - 1];
  return (last.Status ?? '').toUpperCase() === 'RESOLVED';
}

/**
 * Inner content of the comment thread panel: composer plus active and resolved
 * thread lists. Extracted from CommentThreadPanel so the search panel can host
 * the same thread rendering inside its own shell when a result is opened.
 */
export function CommentThreadPanelBody({
  open,
  target,
  authToken,
  focusCommentId,
  focusReplyId,
}: CommentThreadPanelBodyProps) {
  const { libraryId, addComment, refresh, loading, error } = useComments();
  const { canComment, reason } = useCommentPermission(libraryId);
  const { isAudit } = useAuth();
  const threadAll = useThread(target ?? { TagSpecLibraryId: '' });
  const [showResolved, setShowResolved] = useState(false);

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

  // If the focused comment lives in the resolved bucket, expand that section
  // automatically so the highlight is visible without an extra click.
  useEffect(() => {
    if (!focusCommentId) return;
    if (resolved.some((c) => c.Id === focusCommentId)) setShowResolved(true);
  }, [focusCommentId, resolved]);

  const handlePost = async (body: string, mentionIds: string[]) => {
    if (!target) return;
    await addComment(target, body, mentionIds);
  };

  if (isAudit) {
    return (
      <div className="text-center mt-12 px-6">
        <p className="text-sm font-medium text-body">Comments unavailable</p>
        <p className="text-xs text-muted mt-1">
          Audit users cannot view or post TagSpec comments.
        </p>
      </div>
    );
  }

  return (
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
          {active.map((c) => {
            const isParent = focusCommentId ? c.Id === focusCommentId : false;
            return (
              <li key={c.Id}>
                <ThreadItem
                  comment={c}
                  authToken={authToken}
                  focused={isParent && !focusReplyId}
                  focusReplyId={isParent ? focusReplyId : null}
                />
              </li>
            );
          })}
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
              {resolved.map((c) => {
                const isParent = focusCommentId ? c.Id === focusCommentId : false;
                return (
                  <li key={c.Id}>
                    <ThreadItem
                      comment={c}
                      authToken={authToken}
                      resolved
                      defaultCollapsed
                      focused={isParent && !focusReplyId}
                      focusReplyId={isParent ? focusReplyId : null}
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </>
  );
}
