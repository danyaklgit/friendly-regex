import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOptionalCount, useOptionalComments } from '../../context/CommentsContext';
import { useOptionalWizardCommentDrafts } from '../../context/WizardCommentDraftsContext';
import type { TagSpecCommentTarget } from '../../types/comments';
import { CommentThreadPanel } from '../comments/CommentThreadPanel';

interface WizardCommentIconButtonProps {
  /**
   * Stable wizard-form key for the row this icon belongs to (the wizard's
   * own `condition.id` or `attribute.id`, or `WIZARD_DEFINITION_FORM_KEY`
   * for the tag-level icon). Drafts queued here are grouped by this key and
   * resolved to a real `TagSpecCommentTarget` on Save.
   */
  formKey: string;
  kind: 'rule' | 'attribute' | 'definition';
  targetLabel: string;
  /**
   * When the wizard is editing an already-saved definition, the persisted
   * `TagSpecCommentTarget` for this row. Lets the panel surface existing
   * server-side comments alongside the queued drafts.
   */
  persistedTarget?: TagSpecCommentTarget | null;
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
 * Wizard-aware variant of `CommentIconButton`. Reuses the same chat-bubble
 * pill UI and clicks open the same `CommentThreadPanel`, but routes new
 * comments through the wizard's draft store so they don't hit the backend
 * until `tagSpecLibrarySave` resolves.
 *
 * Renders nothing when:
 *   - the user is audit (cannot comment);
 *   - no wizard draft store is mounted (caller forgot to wrap);
 *   - no comments provider is mounted (no library scope — happens when the
 *     wizard is opened without an active checkout).
 */
export function WizardCommentIconButton({
  formKey,
  kind,
  targetLabel,
  persistedTarget,
  size = 'sm',
  title,
}: WizardCommentIconButtonProps) {
  const auth = useAuth();
  const commentsCtx = useOptionalComments();
  const drafts = useOptionalWizardCommentDrafts();
  const persistedCount = useOptionalCount(persistedTarget ?? null);
  const [open, setOpen] = useState(false);

  const authHeader = auth.getAuthHeaders().Authorization ?? '';
  const accessToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  if (auth.isAudit) return null;
  if (!drafts) return null;
  if (!commentsCtx) return null;

  const pendingCount = drafts.countForKey(formKey);
  const count = persistedCount + pendingCount;
  const hasComments = count > 0;
  const dim = size === 'xs' ? 'h-5 w-5' : 'h-6 w-6';
  const iconSize = size === 'xs' ? 12 : 14;

  const tone = hasComments
    ? 'text-cyan-700 dark:text-cyan-300 bg-cyan-100/70 dark:bg-cyan-900/40 ring-1 ring-cyan-300/60 dark:ring-cyan-700/60 hover:bg-cyan-100 dark:hover:bg-cyan-900/60'
    : 'text-cyan-600 dark:text-cyan-400 bg-cyan-50/60 dark:bg-cyan-900/20 ring-1 ring-cyan-200/70 dark:ring-cyan-800/50 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 hover:text-cyan-700 dark:hover:text-cyan-300';

  const tooltip =
    title
    ?? (pendingCount > 0
      ? `${pendingCount} draft comment${pendingCount === 1 ? '' : 's'} pending`
      : hasComments
        ? `${count} comment${count === 1 ? '' : 's'}`
        : 'Add a comment (queued until Save)');

  const pendingDrafts = drafts.getDraftsForKey(formKey);

  return (
    <>
      <button
        type="button"
        data-tour="wizard-comment-icon"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={tooltip}
        aria-label={tooltip}
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
          target={persistedTarget ?? null}
          targetLabel={targetLabel}
          authToken={accessToken}
          onClose={() => setOpen(false)}
          pendingDrafts={pendingDrafts}
          onSubmitDraft={(body, mentionIds) =>
            drafts.addDraft({ formKey, kind, body, mentionIds, targetLabel })
          }
          onUpdateDraft={(draftId, body, mentionIds) => drafts.updateDraft(draftId, body, mentionIds)}
          onRemoveDraft={(draftId) => drafts.removeDraft(draftId)}
        />
      )}
    </>
  );
}
