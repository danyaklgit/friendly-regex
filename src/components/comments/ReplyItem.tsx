import { useAuth } from '../../context/AuthContext';
import type { TagSpecCommentReply } from '../../types/comments';
import { Avatar } from './Avatar';
import { CommentBody } from './CommentBody';
import { formatCommentDate } from './formatDate';

interface ReplyItemProps {
  reply: TagSpecCommentReply;
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

export function ReplyItem({ reply }: ReplyItemProps) {
  const { usersMap } = useAuth();
  const author = usersMap.get(reply.UserId) ?? 'Unknown user';
  const status = (reply.Status ?? 'ACKNOWLEDGED').toUpperCase();
  const style = statusStyles[status] ?? statusStyles.ACKNOWLEDGED;
  const label = statusLabel[status] ?? status;

  return (
    <div className="flex gap-2 text-left">
      <Avatar userId={reply.UserId} displayName={author} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[11px] text-muted mb-0.5">
          <span className="font-medium text-body">{author}</span>
          <span>{formatCommentDate(reply.CreationDate)}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${style}`}>
            {label}
          </span>
        </div>
        <CommentBody text={reply.Comment} />
      </div>
    </div>
  );
}
