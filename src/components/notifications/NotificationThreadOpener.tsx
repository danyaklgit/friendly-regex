import { useMemo } from 'react';
import { useComments } from '../../context/CommentsContext';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import type { TagSpecCommentTarget } from '../../types/comments';
import { getContextValue } from '../../types/tagSpec';
import { CommentThreadPanel } from '../comments/CommentThreadPanel';

interface NotificationThreadOpenerProps {
  /** The comment's id from Action.ActionId. */
  commentId: string;
  /** Fallback target used until the library finishes loading (or if the
   *  exact comment isn't found). */
  fallbackTarget: TagSpecCommentTarget;
  /** Bearer token for the composer's user-list fetch. */
  authToken: string | null;
  onClose: () => void;
  /** Forwarded to the panel. The notifications popover sets this so users
   *  can jump from a thread to the matching Backlog row. */
  onNavigateToBacklog?: (target: TagSpecCommentTarget) => void;
}

/**
 * Mounted inside a CommentsProvider. Searches the loaded comments for the one
 * referenced by the notification and opens the panel scoped to THAT comment's
 * own target (which may be more specific than the notification's ActionPayload
 * — e.g. a rule-level comment when the payload only carries library + def).
 */
export function NotificationThreadOpener({
  commentId,
  fallbackTarget,
  authToken,
  onClose,
  onNavigateToBacklog,
}: NotificationThreadOpenerProps) {
  const { commentsByTarget, loaded } = useComments();
  const { libraries } = useTagSpecs();

  const target = useMemo<TagSpecCommentTarget>(() => {
    if (!loaded) return fallbackTarget;
    for (const list of commentsByTarget.values()) {
      const hit = list.find((c) => c.Id === commentId);
      if (hit) return hit.Target;
    }
    return fallbackTarget;
  }, [commentsByTarget, loaded, commentId, fallbackTarget]);

  // Derive a friendly label from the target — "<Bank> · <Side>", appending the
  // TagSpec name and attribute / rule scope when applicable so the panel header
  // tells the user exactly what they're looking at.
  const label = useMemo<string>(() => {
    const lib = libraries.find((l) => l.Id === target.TagSpecLibraryId);
    const bank = lib ? getContextValue(lib.Context, 'BankSwiftCode') ?? '' : '';
    const side = lib ? getContextValue(lib.Context, 'Side') ?? '' : '';
    const def = lib?.TagSpecDefinitions.find((d) => d.Id === target.TagSpecDefinitionId);
    const parts: string[] = [];
    if (bank || side) parts.push([bank, side].filter(Boolean).join(' · '));
    if (def?.Tag) parts.push(def.Tag);
    if (target.AttributeTag) parts.push(`Attr: ${target.AttributeTag}`);
    else if (target.TagRuleExpressionId) parts.push('Rule');
    return parts.join(' · ') || target.TagSpecLibraryId;
  }, [libraries, target]);

  return (
    <CommentThreadPanel
      open
      target={target}
      targetLabel={label}
      authToken={authToken}
      onClose={onClose}
      onNavigateToBacklog={onNavigateToBacklog}
    />
  );
}
