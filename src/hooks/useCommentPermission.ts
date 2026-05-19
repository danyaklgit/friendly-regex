import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTagSpecs } from './useTagSpecs';

export interface CommentPermission {
  canComment: boolean;
  canReply: boolean;
  reason?: string;
}

/**
 * Permission rules for the comment feature:
 *  - canComment: current user is the library's operator AND the library is INPROGRESS.
 *  - canReply: any authenticated user.
 */
export function useCommentPermission(libraryId: string | null | undefined): CommentPermission {
  const { userId, isAuthenticated, isAudit } = useAuth();
  const { libraries } = useTagSpecs();

  return useMemo<CommentPermission>(() => {
    const canReply = isAuthenticated && !isAudit;
    if (!canReply) {
      return { canComment: false, canReply: false, reason: 'Sign in to reply' };
    }
    if (!libraryId) {
      return { canComment: false, canReply: true, reason: 'No library context' };
    }
    const lib = libraries.find((l) => l.Id === libraryId);
    if (!lib) {
      return { canComment: false, canReply: true, reason: 'Library not found' };
    }
    if (lib.StatusTag !== 'INPROGRESS') {
      return {
        canComment: false,
        canReply: true,
        reason: 'Library is not checked out',
      };
    }
    if (lib.OperatorId !== userId) {
      return {
        canComment: false,
        canReply: true,
        reason: 'Only the current operator can post new comments',
      };
    }
    return { canComment: true, canReply: true };
  }, [isAuthenticated, isAudit, libraries, libraryId, userId]);
}
