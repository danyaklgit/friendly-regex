import { useState } from 'react';
import { Button } from '../shared/Button';
import type { ReplyStatus } from '../../types/comments';

interface ReplyComposerProps {
  onSubmit: (body: string, status: ReplyStatus) => Promise<void> | void;
  onCancel?: () => void;
}

export function ReplyComposer({ onSubmit, onCancel }: ReplyComposerProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState<ReplyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (status: ReplyStatus) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Reply cannot be empty');
      return;
    }
    setSubmitting(status);
    setError(null);
    try {
      await onSubmit(trimmed, status);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reply');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply…"
        rows={2}
        disabled={submitting !== null}
        className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
