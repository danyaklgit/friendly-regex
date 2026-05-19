import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  getTagSpecComments,
  setTagSpecComment,
  replyTagSpecComment,
} from '../api/comments';
import type {
  TagSpecComment,
  TagSpecCommentTarget,
  ReplyStatus,
} from '../types/comments';
import type { TepHeaders } from '../api/transactions';
import { useAuth } from './AuthContext';
import { targetKey, groupCommentsByTarget, normaliseTarget } from '../utils/commentTarget';

interface CommentsContextValue {
  libraryId: string;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  commentsByTarget: Map<string, TagSpecComment[]>;
  /** Trigger a fetch. Safe to call multiple times. */
  refresh: () => Promise<void>;
  /** Fetch on first call; no-op afterwards. The panel calls this on open. */
  ensureLoaded: () => Promise<void>;
  addComment: (target: TagSpecCommentTarget, body: string, mentionIds: string[]) => Promise<void>;
  editComment: (commentId: string, target: TagSpecCommentTarget, body: string, mentionIds: string[]) => Promise<void>;
  addReply: (commentId: string, body: string, status: ReplyStatus) => Promise<void>;
}

const CommentsContext = createContext<CommentsContextValue | null>(null);

interface CommentsProviderProps {
  libraryId: string;
  authToken: string | null;
  tepHeaders: TepHeaders | null;
  /** When true, fetch on mount. Defaults to false (lazy). */
  eager?: boolean;
  children: ReactNode;
}

export function CommentsProvider({ libraryId, authToken, tepHeaders, eager = false, children }: CommentsProviderProps) {
  const { userId } = useAuth();
  const [commentsByTarget, setCommentsByTarget] = useState<Map<string, TagSpecComment[]>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!authToken || !tepHeaders || !libraryId) return;
    setLoading(true);
    setError(null);
    try {
      const all = await getTagSpecComments(
        normaliseTarget({ TagSpecLibraryId: libraryId }),
        authToken,
        tepHeaders,
      );
      if (!mountedRef.current) return;
      setCommentsByTarget(groupCommentsByTarget(all));
      setLoaded(true);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load comments');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [authToken, tepHeaders, libraryId]);

  const ensureLoaded = useCallback(async () => {
    if (loaded || loading) return;
    await refresh();
  }, [loaded, loading, refresh]);

  useEffect(() => {
    // Fetch the first time eager flips to true. Subsequent toggles don't
    // re-fetch — refresh() is called explicitly after writes and on first
    // panel-open via ensureLoaded.
    if (eager && !loaded && !loading) void refresh();
  }, [eager, loaded, loading, refresh]);

  const addComment = useCallback(
    async (target: TagSpecCommentTarget, body: string, mentionIds: string[]) => {
      if (!authToken || !tepHeaders || !userId) throw new Error('Not authenticated');
      await setTagSpecComment(
        {
          Id: null,
          Status: 'ACTIVE',
          Comment: body,
          ReportedByUserId: userId,
          ReportedToUserIds: mentionIds,
          Target: normaliseTarget(target),
        },
        authToken,
        tepHeaders,
      );
      await refresh();
    },
    [authToken, tepHeaders, userId, refresh],
  );

  const editComment = useCallback(
    async (commentId: string, target: TagSpecCommentTarget, body: string, mentionIds: string[]) => {
      if (!authToken || !tepHeaders || !userId) throw new Error('Not authenticated');
      await setTagSpecComment(
        {
          Id: commentId,
          Status: 'ACTIVE',
          Comment: body,
          ReportedByUserId: userId,
          ReportedToUserIds: mentionIds,
          Target: normaliseTarget(target),
        },
        authToken,
        tepHeaders,
      );
      await refresh();
    },
    [authToken, tepHeaders, userId, refresh],
  );

  const addReply = useCallback(
    async (commentId: string, body: string, status: ReplyStatus) => {
      if (!authToken || !tepHeaders || !userId) throw new Error('Not authenticated');
      await replyTagSpecComment(
        commentId,
        { UserId: userId, Status: status, Comment: body },
        authToken,
        tepHeaders,
      );
      await refresh();
    },
    [authToken, tepHeaders, userId, refresh],
  );

  const value = useMemo(
    () => ({ libraryId, loaded, loading, error, commentsByTarget, refresh, ensureLoaded, addComment, editComment, addReply }),
    [libraryId, loaded, loading, error, commentsByTarget, refresh, ensureLoaded, addComment, editComment, addReply],
  );

  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>;
}

export function useComments(): CommentsContextValue {
  const ctx = useContext(CommentsContext);
  if (!ctx) throw new Error('useComments must be used within a CommentsProvider');
  return ctx;
}

/** Optional version — returns null when no provider is mounted. Use when the
 *  caller may render outside a comment-enabled tree. */
export function useOptionalComments(): CommentsContextValue | null {
  return useContext(CommentsContext);
}

export function useThread(target: TagSpecCommentTarget): TagSpecComment[] {
  const ctx = useComments();
  return ctx.commentsByTarget.get(targetKey(target)) ?? [];
}

export function useCount(target: TagSpecCommentTarget): number {
  return useThread(target).length;
}

/** Safe variants that return zero/empty when no provider is mounted. */
export function useOptionalThread(target: TagSpecCommentTarget | null): TagSpecComment[] {
  const ctx = useOptionalComments();
  if (!ctx || !target) return [];
  return ctx.commentsByTarget.get(targetKey(target)) ?? [];
}

export function useOptionalCount(target: TagSpecCommentTarget | null): number {
  return useOptionalThread(target).length;
}
