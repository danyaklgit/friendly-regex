import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useComments } from '../../context/CommentsContext';
import { useCommentPermission } from '../../hooks/useCommentPermission';
import type { ReplyStatus, TagSpecComment, TagSpecCommentReply } from '../../types/comments';
import { buildReplyTree, countTreeReplies, flattenReplies } from '../../utils/replyTree';
import { Avatar } from './Avatar';
import { CommentBody } from './CommentBody';
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

const REPLY_COLLAPSE_THRESHOLD = 5;

export function ThreadItem({ comment, authToken, defaultCollapsed = false, resolved = false }: ThreadItemProps) {
  const { usersMap } = useAuth();
  const { addReply, libraryId } = useComments();
  const { canReply } = useCommentPermission(libraryId);

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [replying, setReplying] = useState(false);
  const [replyingToReply, setReplyingToReply] = useState<TagSpecCommentReply | null>(null);
  const [allRepliesExpanded, setAllRepliesExpanded] = useState(false);

  const author = usersMap.get(comment.ReportedByUserId) ?? 'Unknown user';

  const tree = useMemo(() => buildReplyTree(flattenReplies(comment.Replies)), [comment.Replies]);
  const totalReplies = useMemo(() => countTreeReplies(tree), [tree]);
  const needsCollapse = totalReplies > REPLY_COLLAPSE_THRESHOLD;
  const visibleTree = needsCollapse && !allRepliesExpanded ? tree.slice(-3) : tree;

  const handleReplyToComment = async (body: string, status: ReplyStatus, mentionIds: string[]) => {
    await addReply(comment.Id, body, status, { mentionIds });
    setReplying(false);
    setReplyingToReply(null);
  };

  const handleReplyToReplySubmit = async (body: string, status: ReplyStatus, mentionIds: string[]) => {
    if (!replyingToReply?.Id) return;
    await addReply(comment.Id, body, status, {
      parentReplyId: replyingToReply.Id,
      mentionIds,
    });
    setReplying(false);
    setReplyingToReply(null);
  };

  const handleReplyToReply = (reply: TagSpecCommentReply) => {
    if (!reply.Id) return;
    setReplying(false);
    setReplyingToReply(reply);
  };

  const replyTargetAuthor = replyingToReply
    ? usersMap.get(replyingToReply.UserId) ?? 'Unknown user'
    : null;

  return (
    <article
      data-tour="thread-item"
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
          <div className="mt-1">
            <CommentBody text={comment.Comment} mentionIds={comment.ReportedToUserIds} />
          </div>
          {canReply && (
            <div className="mt-1.5 flex items-center gap-3 text-[11px]">
              <button
                type="button"
                data-tour="thread-reply-button"
                className="text-muted hover:text-body cursor-pointer"
                onClick={() => {
                  setReplyingToReply(null);
                  setReplying((r) => !r);
                }}
              >
                {replying ? 'Hide reply' : 'Reply'}
              </button>
            </div>
          )}
        </div>
      </header>

      {!collapsed && tree.length > 0 && (
        <ol className="mt-3 ml-4 border-l border-border pl-3 space-y-3">
          {needsCollapse && !allRepliesExpanded && (
            <li>
              <button
                type="button"
                className="text-[11px] font-medium text-cyan-700 dark:text-cyan-300 hover:underline cursor-pointer"
                onClick={() => setAllRepliesExpanded(true)}
              >
                Show {totalReplies - 3} earlier {totalReplies - 3 === 1 ? 'reply' : 'replies'}
              </button>
            </li>
          )}
          {visibleTree.map((node, idx) => {
            const key = node.reply.Id ?? `${node.reply.UserId}-${node.reply.CreationDate ?? idx}`;
            return (
              <li key={key}>
                <ReplyItem reply={node.reply} onReply={handleReplyToReply} />
                {node.children.length > 0 && (
                  <ol className="mt-3 ml-5 border-l border-border pl-3 space-y-3">
                    {node.children.map((child, cIdx) => {
                      const ckey = child.reply.Id ?? `${child.reply.UserId}-${child.reply.CreationDate ?? cIdx}`;
                      return (
                        <li key={ckey}>
                          <ReplyItem reply={child.reply} onReply={handleReplyToReply} />
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            );
          })}
          {needsCollapse && allRepliesExpanded && (
            <li>
              <button
                type="button"
                className="text-[11px] font-medium text-muted hover:text-body cursor-pointer"
                onClick={() => setAllRepliesExpanded(false)}
              >
                Show fewer replies
              </button>
            </li>
          )}
        </ol>
      )}

      {!collapsed && (replying || replyingToReply) && (
        <div className="mt-3 ml-4 pl-3 border-l border-border">
          {replyingToReply && replyTargetAuthor && (
            <div className="mb-2 flex items-center gap-2 text-[11px] text-muted">
              <span>
                Replying to <span className="font-medium text-body">{replyTargetAuthor}</span>:
              </span>
              <span className="truncate italic max-w-[260px]">“{replyingToReply.Comment}”</span>
            </div>
          )}
          <ReplyComposer
            authToken={authToken}
            onCancel={() => {
              setReplying(false);
              setReplyingToReply(null);
            }}
            onSubmit={replyingToReply ? handleReplyToReplySubmit : handleReplyToComment}
          />
        </div>
      )}
    </article>
  );
}
