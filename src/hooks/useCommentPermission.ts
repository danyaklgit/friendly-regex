import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

export interface CommentPermission {
  canComment: boolean;
  canReply: boolean;
  reason?: string;
}

/**
 * Permission rules for the comment feature:
 *  - Any authenticated non-audit user can comment and reply on any TagSpec.
 *  - Audit users cannot comment or reply at all.
 * The `libraryId` argument is retained for call-site stability — the rule no
 * longer depends on checkout / operator state.
 */
export function useCommentPermission(_libraryId: string | null | undefined): CommentPermission {
  const { isAuthenticated, isAudit } = useAuth();

  return useMemo<CommentPermission>(() => {
    if (!isAuthenticated) {
      return { canComment: false, canReply: false, reason: 'Sign in to comment' };
    }
    if (isAudit) {
      return { canComment: false, canReply: false, reason: 'Audit users cannot comment' };
    }
    return { canComment: true, canReply: true };
  }, [isAuthenticated, isAudit]);
}
