import { useState } from 'react';
import type { UserNotification, NotificationStatus } from '../../types/notifications';
import { formatCommentDate } from '../comments/formatDate';
import { Avatar } from '../comments/Avatar';
import { useAuth } from '../../context/AuthContext';

interface NotificationItemProps {
  notification: UserNotification;
  /** Resolved sender (the user who triggered the notification). When set the
   *  card shows "From: <name>" with their avatar. */
  senderUserId?: string;
  onMarkStatus: (id: string, status: NotificationStatus) => void | Promise<void>;
  onOpen?: (notification: UserNotification) => void;
}

function MarkUnreadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}

function MarkReadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}

function DismissIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function NotificationItem({ notification, senderUserId, onMarkStatus, onOpen }: NotificationItemProps) {
  const [busy, setBusy] = useState(false);
  const { usersMap } = useAuth();
  const status = (notification.Status ?? '').toUpperCase();
  const isUnread = status === 'UNREAD';
  const senderName = senderUserId ? usersMap.get(senderUserId) ?? 'A teammate' : undefined;

  const run = async (next: NotificationStatus) => {
    setBusy(true);
    try {
      await onMarkStatus(notification.Id, next);
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = () => {
    if (!onOpen) return;
    onOpen(notification);
  };

  return (
    <li
      className={`group relative px-4 py-3 border-b border-border last:border-b-0 transition-colors ${
        isUnread ? 'bg-cyan-50/50 dark:bg-cyan-900/15' : 'bg-surface-elevated'
      } hover:bg-cyan-50 dark:hover:bg-cyan-900/25`}
    >
      <button
        type="button"
        onClick={handleOpen}
        disabled={!onOpen}
        className="block w-full text-left cursor-pointer disabled:cursor-default"
      >
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
              isUnread ? 'bg-cyan-500' : 'bg-transparent ring-1 ring-border'
            }`}
          />
          <div className="flex-1 min-w-0">
            {senderUserId && senderName && (
              <div className="flex items-center gap-1.5 mb-1">
                <Avatar userId={senderUserId} displayName={senderName} size="sm" />
                <span className="text-[11px] font-medium text-body-secondary truncate">
                  {senderName}
                </span>
              </div>
            )}
            <div className="flex items-baseline gap-2">
              <p className={`text-sm truncate ${isUnread ? 'font-semibold text-body' : 'font-medium text-body-secondary'}`}>
                {notification.Title}
              </p>
              <span className="ml-auto text-[10px] text-muted whitespace-nowrap">
                {formatCommentDate(notification.CreationDate)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted line-clamp-2 break-words">
              {notification.Body}
            </p>
          </div>
        </div>
      </button>
      <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {isUnread ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => run('READ')}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-cyan-700 dark:hover:text-cyan-300 cursor-pointer"
          >
            <MarkReadIcon /> Mark as read
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => run('UNREAD')}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-cyan-700 dark:hover:text-cyan-300 cursor-pointer"
          >
            <MarkUnreadIcon /> Mark as unread
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => run('DELETED')}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
          aria-label="Dismiss notification"
        >
          <DismissIcon /> Dismiss
        </button>
      </div>
    </li>
  );
}
