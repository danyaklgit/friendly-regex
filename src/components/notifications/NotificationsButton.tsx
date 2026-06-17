import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import { useNotifications } from '../../hooks/useNotifications';
import type { TepHeaders } from '../../api/transactions';
import type { UserNotification } from '../../types/notifications';
import type { TagSpecComment, TagSpecCommentReply, TagSpecCommentTarget } from '../../types/comments';
import { CommentsProvider } from '../../context/CommentsContext';
import { useOptionalDownloadCenter } from '../../context/DownloadCenterContext';
import { getTagSpecComments } from '../../api/comments';
import { flattenReplies } from '../../utils/replyTree';
import { NotificationItem } from './NotificationItem';
import { NotificationThreadOpener } from './NotificationThreadOpener';

interface OpenThread {
  libraryId: string;
  /** The TagSpecComment id we want to surface — used to pick the exact target. */
  commentId: string;
  /** When the source notification is a reply notification, the id of the
   *  specific reply within `commentId`'s thread that should be highlighted.
   *  Null for top-level comment notifications. */
  replyId: string | null;
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
  return { libraryId, commentId: action.ActionId, replyId: null, fallbackTarget };
}

/** Strip @-mention markup ("@[Name](id)" or similar) and collapse whitespace
 *  so notification Body and reply Comment can be compared as plain text. */
function normaliseCommentText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/@\[[^\]]+\]\([^)]+\)/g, (match) => {
      // @[Name](id) → "@Name"
      const name = match.slice(2, match.indexOf(']'));
      return `@${name}`;
    })
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * For reply notifications the backend identifies the parent comment via
 * Action.ActionId but does not tag the specific reply. Pick the reply by
 * matching the notification Body to the reply's own text — that's the most
 * reliable signal. Falls back to closest-timestamp only when text matching
 * is ambiguous (multiple replies with the same body, or no body at all).
 */
function resolveReplyForNotification(
  n: UserNotification,
  comment: TagSpecComment,
  currentUserId: string | null,
): TagSpecCommentReply | null {
  const isReplyNotif = (n.Type ?? '').toUpperCase().includes('REPLY');
  if (!isReplyNotif) return null;
  const replies = flattenReplies(comment.Replies);
  if (replies.length === 0) return null;

  const notifBody = normaliseCommentText(n.Body);

  // 1. Exact-text match against the notification body. If exactly one reply
  //    matches we're done — this is the deterministic path the backend
  //    enables by including the reply text in Body.
  if (notifBody) {
    const exact = replies.filter((r) => normaliseCommentText(r.Comment) === notifBody);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) {
      // Same text posted twice — disambiguate by closest timestamp.
      return pickClosestByTime(exact, n.CreationDate) ?? exact[0];
    }

    // 2. Substring match either direction (handles "User replied: <text>"
    //    style bodies, or bodies that include only a snippet).
    const containing = replies.filter((r) => {
      const replyText = normaliseCommentText(r.Comment);
      if (!replyText) return false;
      return notifBody.includes(replyText) || replyText.includes(notifBody);
    });
    if (containing.length === 1) return containing[0];
    if (containing.length > 1) {
      return pickClosestByTime(containing, n.CreationDate) ?? containing[0];
    }
  }

  // 3. Fall back to closest-timestamp across all replies. Mentioning the
  //    recipient is used only as a final tie-breaker, never as a pre-filter
  //    (a thread can produce a notification for the recipient even when the
  //    triggering reply doesn't @-mention them).
  const closest = pickClosestByTime(replies, n.CreationDate);
  if (!closest) return null;
  const mine = currentUserId ?? '';
  if (mine && (closest.ReportedToUserIds ?? []).includes(mine)) return closest;
  // If the closest-in-time reply does mention the user, prefer it; otherwise
  // also accept it — it's still the best signal we have.
  return closest;
}

function pickClosestByTime(
  pool: TagSpecCommentReply[],
  notifDate: string | undefined,
): TagSpecCommentReply | null {
  if (pool.length === 0) return null;
  const notifTime = notifDate ? Date.parse(notifDate) : NaN;
  if (Number.isNaN(notifTime)) {
    const sorted = [...pool].sort((a, b) =>
      (b.CreationDate ?? '').localeCompare(a.CreationDate ?? ''),
    );
    return sorted[0] ?? null;
  }
  let best = pool[0];
  let bestDelta = Math.abs((Date.parse(best.CreationDate ?? '') || 0) - notifTime);
  for (const r of pool) {
    const delta = Math.abs((Date.parse(r.CreationDate ?? '') || 0) - notifTime);
    if (delta < bestDelta) {
      best = r;
      bestDelta = delta;
    }
  }
  return best;
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

interface NotificationsButtonProps {
  /** When set, the panel opened from a notification shows a "View in
   *  Backlog" link that calls this with the comment's target. */
  onNavigateToBacklog?: (target: TagSpecCommentTarget) => void;
}

export function NotificationsButton({ onNavigateToBacklog }: NotificationsButtonProps = {}) {
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

  // Push a refresh into the Download Center whenever a new EXPORT_READY or
  // EXPORT_FAILED notification appears, so the modal's polling loop doesn't
  // have to wait up to 3s after the notification lands. Tracks the set of
  // notification ids we've already forwarded to avoid re-triggering on every
  // poll. Safely no-ops if the provider isn't mounted.
  const downloadCenter = useOptionalDownloadCenter();
  const forwardedExportIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!downloadCenter) return;
    let newOne = false;
    for (const n of notifications) {
      const t = (n.Type ?? '').toUpperCase();
      if (t === 'EXPORT_READY' || t === 'EXPORT_FAILED') {
        if (!forwardedExportIdsRef.current.has(n.Id)) {
          forwardedExportIdsRef.current.add(n.Id);
          newOne = true;
        }
      }
    }
    if (newOne) downloadCenter.notifyExportEvent();
  }, [notifications, downloadCenter]);

  // Sender enrichment: when the panel opens, fetch the comments for each
  // unique library referenced by a notification (cached per session) and
  // keep the full comment objects so we can derive the actual sender per
  // notification (comment author vs reply author).
  const fetchedLibrariesRef = useRef<Set<string>>(new Set());
  const [commentById, setCommentById] = useState<Map<string, TagSpecComment>>(new Map());

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
      setCommentById((prev) => {
        const next = new Map(prev);
        for (const [libId, list] of pairs) {
          fetchedLibrariesRef.current.add(libId);
          for (const c of list) next.set(c.Id, c);
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [open, notifications, authToken, tepHeaders]);

  /**
   * Resolve who triggered a notification. For reply notifications, uses the
   * same heuristic as `resolveReplyForNotification` so the sender name and
   * the highlighted reply always agree.
   */
  const resolveSender = (n: UserNotification): string | undefined => {
    const actionId = n.Action?.ActionId;
    if (!actionId) return undefined;
    const comment = commentById.get(actionId);
    if (!comment) return undefined;
    const reply = resolveReplyForNotification(n, comment, userId);
    if (reply) return reply.UserId;
    return comment.ReportedByUserId;
  };

  const handleOpenNotification = (n: UserNotification) => {
    const type = (n.Type ?? '').toUpperCase();
    // Export notifications route to the Download Center modal instead of a
    // comment thread — same click-handler surface, different destination.
    if (type === 'EXPORT_READY' || type === 'EXPORT_FAILED') {
      if ((n.Status ?? '').toUpperCase() === 'UNREAD') {
        void markStatus(n.Id, 'READ');
      }
      downloadCenter?.openModal();
      setOpen(false);
      return;
    }
    const open = targetFromNotification(n);
    if ((n.Status ?? '').toUpperCase() === 'UNREAD') {
      void markStatus(n.Id, 'READ');
    }
    if (open) {
      const comment = commentById.get(open.commentId);
      if (comment) {
        const reply = resolveReplyForNotification(n, comment, userId);
        if (reply?.Id) {
          setOpenThread({ ...open, replyId: reply.Id });
          setOpen(false);
          return;
        }
      }
      setOpenThread(open);
      setOpen(false);
    }
  };

  // Outside click + Escape closes the popover.
  // Exception: clicks inside intro.js tooltips/overlays (used by the onboarding
  // tour) do not close the popover. Without this carve-out, pressing Next in
  // the Notifications tour would immediately dismiss the drawer because the
  // tooltip is portalled to <body> and counts as "outside" wrapperRef.
  useEffect(() => {
    if (!open) return;
    const isInsideIntroJs = (target: Node | null): boolean => {
      let el: Node | null = target;
      while (el && el !== document) {
        if (el instanceof HTMLElement) {
          const cls = el.classList;
          if (
            cls.contains('introjs-tooltip') ||
            cls.contains('introjs-tooltipReferenceLayer') ||
            cls.contains('introjs-helperLayer') ||
            cls.contains('introjs-overlay') ||
            cls.contains('introjs-button')
          ) {
            return true;
          }
        }
        el = (el as Node).parentNode;
      }
      return false;
    };
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(target) &&
        !isInsideIntroJs(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      // Don't close on Escape while a tour is running; intro.js owns Escape to
      // exit the tour cleanly. The tour engine will close the popover itself
      // when the tour ends.
      if (e.key === 'Escape' && !document.querySelector('.introjs-tooltip')) {
        setOpen(false);
      }
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
        data-tour="notifications-bell"
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
          data-tour="notifications-drawer"
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
                    senderUserId={resolveSender(n)}
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
            replyId={openThread.replyId}
            fallbackTarget={openThread.fallbackTarget}
            authToken={authToken}
            onClose={() => setOpenThread(null)}
            onNavigateToBacklog={onNavigateToBacklog}
          />
        </CommentsProvider>
      )}
    </div>
  );
}
