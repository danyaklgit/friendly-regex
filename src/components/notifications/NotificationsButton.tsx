import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import { useNotifications } from '../../hooks/useNotifications';
import type { TepHeaders } from '../../api/transactions';
import type { UserNotification } from '../../types/notifications';
import type { TagSpecCommentTarget } from '../../types/comments';
import { CommentsProvider } from '../../context/CommentsContext';
import { getTagSpecComments } from '../../api/comments';
import { NotificationItem } from './NotificationItem';
import { NotificationThreadOpener } from './NotificationThreadOpener';

interface OpenThread {
  libraryId: string;
  /** The TagSpecComment id we want to surface — used to pick the exact target. */
  commentId: string;
  /** Fallback target used until comments load (or if the id isn't found). */
  fallbackTarget: TagSpecCommentTarget;
}

/**
 * Build an OpenThread descriptor from a notification's Action. Returns null
 * when the notification doesn't carry enough context to open a thread.
 */
function targetFromNotification(n: UserNotification): OpenThread | null {
  const action = n.Action;
  if (!action || action.ActionName !== 'GetTagSpecComments') return null;
  const payload = action.ActionPayload ?? {};
  const libraryId = payload['TagSpecLibraryId'];
  if (!libraryId || !action.ActionId) return null;
  const fallbackTarget: TagSpecCommentTarget = {
    TagSpecLibraryId: libraryId,
    TagSpecDefinitionId: payload['TagSpecDefinitionId'] ?? null,
    TagRuleExpressionId: payload['TagRuleExpressionId'] ?? null,
    AttributeTag: payload['AttributeTag'] ?? null,
  };
  return { libraryId, commentId: action.ActionId, fallbackTarget };
}

function BellIcon({ ringing }: { ringing: boolean }) {
  return (
    <svg
      className="w-4 h-4"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={ringing ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={ringing ? 0 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9a6 6 0 0 0-12 0v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m6.714 0a24.255 24.255 0 0 1-6.714 0m6.714 0a3 3 0 1 1-6.714 0" />
    </svg>
  );
}

export function NotificationsButton() {
  const { userId, getAuthHeaders, isAuthenticated } = useAuth();
  const tepConfig = useTepConfig();
  const [open, setOpen] = useState(false);
  const [openThread, setOpenThread] = useState<OpenThread | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const authHeader = getAuthHeaders().Authorization ?? '';
  const authToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  // Memoize so the reference is stable across re-renders — otherwise
  // useNotifications' polling effect tears down and re-fires on every render,
  // hammering /GetUserNotifications.
  const tepHeaders = useMemo<TepHeaders | null>(
    () =>
      userId
        ? {
            apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
            userId,
            tenantCode: tepConfig.ttpTenantCode,
            languageCode: tepConfig.languageCode,
            timeZone: tepConfig.timeZone,
            requestId: tepConfig.ttpRequestId,
          }
        : null,
    [
      userId,
      tepConfig.ttpTenantCode,
      tepConfig.languageCode,
      tepConfig.timeZone,
      tepConfig.ttpRequestId,
    ],
  );

  const { notifications, loading, error, unreadCount, markStatus, markAllRead } =
    useNotifications(userId, authToken, tepHeaders);

  // Sender enrichment: when the panel opens, fetch the comments for each
  // unique library referenced by a notification (cached per session) and
  // build a map of commentId → ReportedByUserId so each notification card
  // can show its sender's avatar/name.
  const fetchedLibrariesRef = useRef<Set<string>>(new Set());
  const [senderByCommentId, setSenderByCommentId] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open || !authToken || !tepHeaders) return;
    const wanted = new Set<string>();
    for (const n of notifications) {
      const lib = n.Action?.ActionPayload?.['TagSpecLibraryId'];
      if (lib && !fetchedLibrariesRef.current.has(lib)) wanted.add(lib);
    }
    if (wanted.size === 0) return;

    let cancelled = false;
    Promise.all(
      Array.from(wanted).map(async (libId) => {
        try {
          const list = await getTagSpecComments(
            { TagSpecLibraryId: libId },
            authToken,
            tepHeaders,
          );
          return [libId, list] as const;
        } catch {
          return [libId, [] as Awaited<ReturnType<typeof getTagSpecComments>>] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setSenderByCommentId((prev) => {
        const next = new Map(prev);
        for (const [libId, list] of pairs) {
          fetchedLibrariesRef.current.add(libId);
          for (const c of list) next.set(c.Id, c.ReportedByUserId);
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [open, notifications, authToken, tepHeaders]);

  const handleOpenNotification = (n: UserNotification) => {
    const open = targetFromNotification(n);
    if ((n.Status ?? '').toUpperCase() === 'UNREAD') {
      void markStatus(n.Id, 'READ');
    }
    if (open) {
      setOpenThread(open);
      setOpen(false);
    }
  };

  // Outside click + Escape closes the popover.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isAuthenticated || !userId) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Notifications'}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        className="relative text-muted hover:text-heading transition-colors cursor-pointer p-1"
      >
        <BellIcon ringing={unreadCount > 0} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-cyan-500 dark:bg-cyan-400 text-white dark:text-cyan-950 text-[9px] font-bold leading-none inline-flex items-center justify-center ring-2 ring-surface"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[380px] max-h-[520px] bg-surface-elevated border border-border rounded-lg shadow-[0_24px_48px_-12px_rgba(15,23,42,0.45)] flex flex-col overflow-hidden"
        >
          <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-elevated">
            <div>
              <h2 className="text-sm font-semibold text-body">Notifications</h2>
              <p className="text-[10px] text-muted">
                {unreadCount === 0
                  ? 'You’re all caught up'
                  : `${unreadCount} unread`}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] font-medium text-cyan-700 dark:text-cyan-300 hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading && notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-muted">Loading…</p>
            )}
            {error && (
              <p className="px-4 py-6 text-center text-xs text-rose-600">{error}</p>
            )}
            {!loading && notifications.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center text-center px-6 py-10">
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
                  <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9a6 6 0 0 0-12 0v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m6.714 0a24.255 24.255 0 0 1-6.714 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-sm font-medium text-body">No notifications</p>
                <p className="text-xs text-muted mt-1">
                  You’ll see mentions and replies on your TagSpec comments here.
                </p>
              </div>
            )}
            {notifications.length > 0 && (
              <ul>
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.Id}
                    notification={n}
                    senderUserId={n.Action?.ActionId ? senderByCommentId.get(n.Action.ActionId) : undefined}
                    onMarkStatus={markStatus}
                    onOpen={handleOpenNotification}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {openThread && (
        <CommentsProvider
          libraryId={openThread.libraryId}
          authToken={authToken}
          tepHeaders={tepHeaders}
          eager
        >
          <NotificationThreadOpener
            commentId={openThread.commentId}
            fallbackTarget={openThread.fallbackTarget}
            authToken={authToken}
            onClose={() => setOpenThread(null)}
          />
        </CommentsProvider>
      )}
    </div>
  );
}
