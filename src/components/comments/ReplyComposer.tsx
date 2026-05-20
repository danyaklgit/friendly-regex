import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../shared/Button';
import { MentionAutocomplete, userDisplayName } from './MentionAutocomplete';
import { useUserList } from './useUserList';
import { dedupeMentionIds } from '../../utils/mentions';
import type { ReplyStatus } from '../../types/comments';
import type { UserInfo } from '../../api/identity';

interface ReplyComposerProps {
  authToken: string | null;
  onSubmit: (body: string, status: ReplyStatus, mentionIds: string[]) => Promise<void> | void;
  onCancel?: () => void;
}

interface MentionAnchor {
  start: number;
  query: string;
}

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

export function ReplyComposer({ authToken, onSubmit, onCancel }: ReplyComposerProps) {
  const [text, setText] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<ReplyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<MentionAnchor | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { users, error: usersError } = useUserList(authToken);

  const recomputeAnchor = useCallback((value: string, caret: number) => {
    setAnchor(findMentionAnchor(value, caret));
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

  const filtered = users
    .filter((u) => {
      if (!anchor) return false;
      const q = anchor.query.toLowerCase();
      if (!q) return true;
      return (
        userDisplayName(u).toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      );
    })
    .slice(0, 8);

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

  useEffect(() => {
    if (anchor) setActiveIndex(0);
  }, [anchor]);

  const send = async (status: ReplyStatus) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Reply cannot be empty');
      return;
    }
    setSubmitting(status);
    setError(null);
    try {
      const stillReferenced = mentionIds.filter((id) => {
        const u = users.find((x) => x.id === id);
        if (!u) return false;
        return text.includes(`@${userDisplayName(u)}`);
      });
      await onSubmit(trimmed, status, dedupeMentionIds(stillReferenced));
      setText('');
      setMentionIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reply');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="relative" data-tour="reply-composer">
      <textarea
        ref={textareaRef}
        data-tour="reply-composer-textarea"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKey}
        onSelect={(e) => recomputeAnchor(text, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        placeholder="Write a reply. Type @ to mention someone."
        rows={2}
        disabled={submitting !== null}
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
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {usersError && (
          <span className="mr-auto text-[11px] text-amber-600 dark:text-amber-400">
            Mentions unavailable
          </span>
        )}
        {error && <span className="mr-auto text-[11px] text-rose-600 dark:text-rose-400">{error}</span>}
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting !== null}>
            Cancel
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => send('REJECTED')}
          disabled={submitting !== null || text.trim().length === 0}
          loading={submitting === 'REJECTED'}
        >
          Reject
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => send('RESOLVED')}
          disabled={submitting !== null || text.trim().length === 0}
          loading={submitting === 'RESOLVED'}
        >
          Resolve
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => send('ACKNOWLEDGED')}
          disabled={submitting !== null || text.trim().length === 0}
          loading={submitting === 'ACKNOWLEDGED'}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}
