import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useComments } from '../../context/CommentsContext';
import { useCommentPermission } from '../../hooks/useCommentPermission';
import type { ReplyStatus, TagSpecComment } from '../../types/comments';
import { Avatar } from './Avatar';
import { CommentBody } from './CommentBody';
import { CommentComposer } from './CommentComposer';
import { ReplyComposer } from './ReplyComposer';
import { ReplyItem } from './ReplyItem';
import { formatCommentDate } from './formatDate';

interface ThreadItemProps {
  comment: TagSpecComment;
  authToken: string | null;
  /** When true, only the header is shown; user expands to see replies. */
  defaultCollapsed?: boolean;
  resolved?: boolean;
}

export function ThreadItem({ comment, authToken, defaultCollapsed = false, resolved = false }: ThreadItemProps) {
  const { userId } = useAuth();
  const { usersMap } = useAuth();
  const { editComment, addReply, libraryId } = useComments();
  const { canComment, canReply } = useCommentPermission(libraryId);

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);

  const author = usersMap.get(comment.ReportedByUserId) ?? 'Unknown user';
  const isOwn = comment.ReportedByUserId === userId;
  const canEdit = isOwn && canComment;

  const handleEdit = async (body: string, mentionIds: string[]) => {
    await editComment(comment.Id, comment.Target, body, mentionIds);
    setEditing(false);
  };

  const handleReply = async (body: string, status: ReplyStatus) => {
    await addReply(comment.Id, body, status);
    setReplying(false);
  };

  return (
    <article
      className={`rounded-lg border text-left ${
        resolved ? 'border-emerald-300/60 bg-emerald-50/40 dark:bg-emerald-900/10' : 'border-border bg-surface'
      } px-3 py-2.5`}
    >
      <header className="flex items-start gap-2">
        <Avatar userId={comment.ReportedByUserId} displayName={author} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="font-medium text-body">{author}</span>
            <span>{formatCommentDate(comment.CreationDate)}</span>
            {resolved && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 text-[10px] font-medium">
                Resolved
              </span>
            )}
            {defaultCollapsed && (
              <button
                type="button"
                className="ml-auto text-muted hover:text-body text-[11px] cursor-pointer"
                onClick={() => setCollapsed((c) => !c)}
              >
                {collapsed ? 'Expand' : 'Collapse'}
              </button>
            )}
          </div>
          {!editing && (
            <div className="mt-1">
              <CommentBody text={comment.Comment} mentionIds={comment.ReportedToUserIds} />
            </div>
          )}
          {editing && (
            <div className="mt-2">
              <CommentComposer
                authToken={authToken}
                initialText={comment.Comment}
                initialMentionIds={comment.ReportedToUserIds ?? []}
                submitLabel="Save"
                onCancel={() => setEditing(false)}
                onSubmit={handleEdit}
              />
            </div>
          )}
          {!editing && (
            <div className="mt-1.5 flex items-center gap-3 text-[11px]">
              {canReply && (
                <button
                  type="button"
                  className="text-muted hover:text-body cursor-pointer"
                  onClick={() => setReplying((r) => !r)}
                >
                  {replying ? 'Hide reply' : 'Reply'}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="text-muted hover:text-body cursor-pointer"
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {!collapsed && (comment.Replies?.length ?? 0) > 0 && (
        <ol className="mt-3 ml-4 border-l border-border pl-3 space-y-3">
          {comment.Replies!.map((reply, idx) => (
            <li key={`${reply.UserId}-${reply.CreationDate ?? idx}`}>
              <ReplyItem reply={reply} />
            </li>
          ))}
        </ol>
      )}

      {!collapsed && replying && (
        <div className="mt-3 ml-4 pl-3 border-l border-border">
          <ReplyComposer onCancel={() => setReplying(false)} onSubmit={handleReply} />
        </div>
      )}
    </article>
  );
}
