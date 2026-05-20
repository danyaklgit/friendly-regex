import { useState } from 'react';
import { useOptionalComments, useOptionalCount } from '../../context/CommentsContext';
import { useAuth } from '../../context/AuthContext';
import type { TagSpecCommentTarget } from '../../types/comments';
import { CommentThreadPanel } from './CommentThreadPanel';

interface CommentIconButtonProps {
  target: TagSpecCommentTarget | null;
  targetLabel?: string;
  size?: 'xs' | 'sm';
  title?: string;
}

function ChatIconFilled({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6.172l-3.535 3.535A1 1 0 0 1 9 20.828V18H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />
    </svg>
  );
}

function ChatIconOutline({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

/**
 * Pill-shaped comment affordance. Empty state shows an outlined bubble (muted);
 * active state shows a filled bubble in the primary tone with a floating count
 * badge. Only renders when a CommentsProvider is mounted in an ancestor AND the
 * target is fully populated. Clicking opens the side panel scoped to that target.
 */
export function CommentIconButton({ target, targetLabel, size = 'sm', title }: CommentIconButtonProps) {
  const commentsCtx = useOptionalComments();
  const count = useOptionalCount(target);
  const [open, setOpen] = useState(false);
  const auth = useAuth();
  const accessTokenHeader = auth.getAuthHeaders().Authorization ?? '';
  const accessToken = accessTokenHeader.startsWith('Bearer ')
    ? accessTokenHeader.slice('Bearer '.length)
    : null;

  if (!commentsCtx || !target) return null;
  if (auth.isAudit) return null;

  const hasComments = count > 0;
  const dim = size === 'xs' ? 'h-5 w-5' : 'h-6 w-6';
  const iconSize = size === 'xs' ? 12 : 14;

  const tone = hasComments
    ? 'text-cyan-700 dark:text-cyan-300 bg-cyan-100/70 dark:bg-cyan-900/40 ring-1 ring-cyan-300/60 dark:ring-cyan-700/60 hover:bg-cyan-100 dark:hover:bg-cyan-900/60'
    : 'text-cyan-600 dark:text-cyan-400 bg-cyan-50/60 dark:bg-cyan-900/20 ring-1 ring-cyan-200/70 dark:ring-cyan-800/50 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 hover:text-cyan-700 dark:hover:text-cyan-300';

  return (
    <>
      <button
        type="button"
        data-tour="tag-comment-icon"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={title ?? (hasComments ? `${count} comment${count === 1 ? '' : 's'}` : 'Add a comment')}
        aria-label={title ?? (hasComments ? `${count} comments` : 'Add comment')}
        className={`relative inline-flex shrink-0 items-center justify-center rounded-full cursor-pointer transition-all duration-150 hover:scale-110 active:scale-95 ${dim} ${tone}`}
      >
        {hasComments ? <ChatIconFilled size={iconSize} /> : <ChatIconOutline size={iconSize} />}
        {hasComments && (
          <span
            className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-cyan-500 dark:bg-cyan-400 text-white dark:text-cyan-950 text-[9px] font-bold leading-none inline-flex items-center justify-center shadow-sm ring-2 ring-surface dark:ring-surface-elevated"
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <CommentThreadPanel
          open={open}
          target={target}
          targetLabel={targetLabel}
          authToken={accessToken}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
