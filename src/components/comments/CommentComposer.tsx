import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../shared/Button';
import { MentionAutocomplete, userDisplayName } from './MentionAutocomplete';
import { useUserList } from './useUserList';
import { dedupeMentionIds } from '../../utils/mentions';
import type { UserInfo } from '../../api/identity';

interface CommentComposerProps {
  authToken: string | null;
  /** Pre-fills the text and mentions when editing. */
  initialText?: string;
  initialMentionIds?: string[];
  submitLabel?: string;
  placeholder?: string;
  onCancel?: () => void;
  onSubmit: (body: string, mentionIds: string[]) => Promise<void> | void;
}

interface MentionAnchor {
  start: number;
  query: string;
}

/**
 * Detect an active "@..." anchor immediately before the caret. The anchor
 * runs from the last "@" back to whitespace or start-of-text and is only
 * valid when the "@" sits at the start of the text or is preceded by
 * whitespace (so emails like foo@bar don't trigger the picker).
 */
function findMentionAnchor(text: string, caret: number): MentionAnchor | null {
  if (caret === 0) return null;
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '@') {
      const prev = i === 0 ? ' ' : text[i - 1];
      if (!/\s/.test(prev) && i !== 0) return null;
      const query = text.slice(i + 1, caret);
      if (/\s/.test(query)) return null;
      return { start: i, query };
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

export function CommentComposer({
  authToken,
  initialText = '',
  initialMentionIds = [],
  submitLabel = 'Post',
  placeholder = 'Add a comment. Type @ to mention someone.',
  onCancel,
  onSubmit,
}: CommentComposerProps) {
  const [text, setText] = useState(initialText);
  const [mentionIds, setMentionIds] = useState<string[]>(initialMentionIds);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<MentionAnchor | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { users, error: usersError } = useUserList(authToken);

  // Recompute mention anchor whenever text/caret changes
  const recomputeAnchor = useCallback((value: string, caret: number) => {
    const a = findMentionAnchor(value, caret);
    setAnchor(a);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      setText(newText);
      const caret = e.target.selectionStart ?? newText.length;
      recomputeAnchor(newText, caret);
    },
    [recomputeAnchor],
  );

  const handleSelect = useCallback(
    (user: UserInfo) => {
      if (!anchor) return;
      const name = userDisplayName(user);
      const before = text.slice(0, anchor.start);
      const after = text.slice(anchor.start + 1 + anchor.query.length);
      const insertion = `@${name} `;
      const newText = `${before}${insertion}${after}`;
      setText(newText);
      setMentionIds((prev) => dedupeMentionIds([...prev, user.id]));
      setAnchor(null);
      // restore caret position after insertion
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        const pos = before.length + insertion.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    [anchor, text],
  );

  const filtered = users.filter((u) => {
    if (!anchor) return false;
    const q = anchor.query.toLowerCase();
    if (!q) return true;
    return (
      userDisplayName(u).toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!anchor || filtered.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelect(filtered[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setAnchor(null);
      }
    },
    [anchor, filtered, activeIndex, handleSelect],
  );

  // Reset active index when anchor opens
  useEffect(() => {
    if (anchor) setActiveIndex(0);
  }, [anchor]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      // Filter mention ids to only those still referenced in the text
      const stillReferenced = mentionIds.filter((id) => {
        const u = users.find((x) => x.id === id);
        if (!u) return false;
        return text.includes(`@${userDisplayName(u)}`);
      });
      await onSubmit(trimmed, dedupeMentionIds(stillReferenced));
      setText('');
      setMentionIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setSubmitting(false);
    }
  }, [text, mentionIds, users, onSubmit]);

  return (
    <div className="relative" data-tour="comment-composer">
      <textarea
        ref={textareaRef}
        data-tour="comment-composer-textarea"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKey}
        onSelect={(e) => recomputeAnchor(text, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        placeholder={placeholder}
        rows={3}
        disabled={submitting}
        className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      />
      {anchor && (
        <MentionAutocomplete
          users={users}
          query={anchor.query}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
          onSelect={handleSelect}
        />
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        {usersError && (
          <span className="mr-auto text-[11px] text-amber-600 dark:text-amber-400">
            Mentions unavailable
          </span>
        )}
        {error && <span className="mr-auto text-[11px] text-rose-600 dark:text-rose-400">{error}</span>}
        {onCancel && (
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || text.trim().length === 0}
        >
          {submitting ? 'Posting…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
