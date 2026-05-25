import { useEffect, useMemo, useState } from 'react';
import { useComments, useOptionalThread } from '../../context/CommentsContext';
import { useCommentPermission } from '../../hooks/useCommentPermission';
import { useAuth } from '../../context/AuthContext';
import type { TagSpecComment, TagSpecCommentTarget } from '../../types/comments';
import type { WizardCommentDraft } from '../../context/WizardCommentDraftsContext';
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
  /** When supplied (even as an empty array) the body shows a Pending section
   *  above the persisted thread and routes the composer through `onSubmitDraft`
   *  instead of `addComment`. Used by the Tag Wizard so comments authored on
   *  in-progress conditions and attributes don't hit the backend until after
   *  TagSpecLibrarySave commits. */
  pendingDrafts?: WizardCommentDraft[];
  onSubmitDraft?: (body: string, mentionIds: string[]) => void;
  onUpdateDraft?: (draftId: string, body: string, mentionIds: string[]) => void;
  onRemoveDraft?: (draftId: string) => void;
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
  pendingDrafts,
  onSubmitDraft,
  onUpdateDraft,
  onRemoveDraft,
}: CommentThreadPanelBodyProps) {
  const { libraryId, addComment, refresh, loading, error } = useComments();
  const { canComment, reason } = useCommentPermission(libraryId);
  const { isAudit } = useAuth();
  // `useOptionalThread` (rather than `useThread`) so a wizard-only target
  // with `TagSpecLibraryId` set but no `TagSpecDefinitionId` yet doesn't trip
  // the strict provider lookup. Also returns [] cleanly when target is null.
  const threadAll = useOptionalThread(target);
  const [showResolved, setShowResolved] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  const draftMode = pendingDrafts !== undefined;

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
    if (draftMode) {
      onSubmitDraft?.(body, mentionIds);
      return;
    }
    if (!target) return;
    await addComment(target, body, mentionIds);
  };

  const handleSaveDraftEdit = (draftId: string) => async (
    body: string,
    mentionIds: string[],
  ) => {
    onUpdateDraft?.(draftId, body, mentionIds);
    setEditingDraftId(null);
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
      {(target || draftMode) && (
        <section>
          {canComment ? (
            <CommentComposer
              authToken={authToken}
              onSubmit={handlePost}
              submitLabel={draftMode ? 'Queue draft' : 'Post'}
              placeholder={
                draftMode
                  ? 'Add a comment. Posts to the rule on Save. Type @ to mention someone.'
                  : 'Add a comment. Type @ to mention someone.'
              }
            />
          ) : (
            <p className="text-[11px] text-muted bg-surface rounded-md border border-border px-3 py-2">
              {reason ?? 'You cannot post a new comment here.'} You can still reply to existing threads below.
            </p>
          )}
        </section>
      )}

      {draftMode && pendingDrafts && pendingDrafts.length > 0 && (
        <section className="rounded-md border border-cyan-300/60 dark:border-cyan-800/60 bg-cyan-50/40 dark:bg-cyan-900/15 px-3 py-3 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] uppercase text-cyan-700 dark:text-cyan-300">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6l3 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Pending — will post on Save
          </div>
          <ol className="space-y-2">
            {pendingDrafts.map((d) => (
              <li
                key={d.id}
                className="rounded border border-border bg-surface-elevated px-3 py-2 text-xs text-body"
              >
                {editingDraftId === d.id ? (
                  <CommentComposer
                    authToken={authToken}
                    initialText={d.body}
                    initialMentionIds={d.mentionIds}
                    submitLabel="Update draft"
                    onSubmit={handleSaveDraftEdit(d.id)}
                    onCancel={() => setEditingDraftId(null)}
                  />
                ) : (
                  <>
                    <p className="whitespace-pre-wrap break-words">{d.body}</p>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingDraftId(d.id)}
                        className="text-[11px] text-muted hover:text-body cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveDraft?.(d.id)}
                        className="text-[11px] text-rose-600 hover:text-rose-700 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
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
