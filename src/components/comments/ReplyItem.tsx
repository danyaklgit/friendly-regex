import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCommentPermission } from '../../hooks/useCommentPermission';
import { useComments } from '../../context/CommentsContext';
import type { TagSpecCommentReply } from '../../types/comments';
import { Avatar } from './Avatar';
import { CommentBody } from './CommentBody';
import { formatCommentDate } from './formatDate';

interface ReplyItemProps {
  reply: TagSpecCommentReply;
  onReply?: (reply: TagSpecCommentReply) => void;
  /** When true, scroll into view and pulse a highlight ring so the user can
   *  immediately see which reply was referenced by the notification that
   *  opened the panel. */
  focused?: boolean;
}

const statusStyles: Record<string, string> = {
  ACKNOWLEDGED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  RESOLVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
};

const statusLabel: Record<string, string> = {
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
};

export function ReplyItem({ reply, onReply, focused = false }: ReplyItemProps) {
  const { usersMap } = useAuth();
  const { libraryId } = useComments();
  const { canReply } = useCommentPermission(libraryId);
  const author = usersMap.get(reply.UserId) ?? 'Unknown user';
  const status = (reply.Status ?? 'ACKNOWLEDGED').toUpperCase();
  const style = statusStyles[status] ?? statusStyles.ACKNOWLEDGED;
  const label = statusLabel[status] ?? status;
  const canShowReplyButton = onReply && canReply && reply.Id;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pulseRing, setPulseRing] = useState(false);
  useEffect(() => {
    if (!focused || !rootRef.current) return;
    rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPulseRing(true);
    const t = setTimeout(() => setPulseRing(false), 2_400);
    return () => clearTimeout(t);
  }, [focused, reply.Id]);

  return (
    <div
      ref={rootRef}
      className={`flex gap-2 text-left rounded-md transition-shadow duration-500 ${
        pulseRing
          ? 'ring-2 ring-cyan-400/80 dark:ring-cyan-300/70 shadow-[0_0_0_4px_rgba(34,211,238,0.18)] -mx-1 px-1 py-1'
          : ''
      }`}
    >
      <Avatar userId={reply.UserId} displayName={author} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[11px] text-muted mb-0.5">
          <span className="font-medium text-body">{author}</span>
          <span>{formatCommentDate(reply.CreationDate)}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${style}`}>
            {label}
          </span>
        </div>
        <CommentBody text={reply.Comment} mentionIds={reply.ReportedToUserIds} />
        {canShowReplyButton && (
          <button
            type="button"
            className="mt-1 text-[11px] text-muted hover:text-body cursor-pointer"
            onClick={() => onReply!(reply)}
          >
            Reply
          </button>
        )}
      </div>
    </div>
  );
}
