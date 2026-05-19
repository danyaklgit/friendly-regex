import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { renderCommentSegments } from '../../utils/mentions';

interface CommentBodyProps {
  text: string;
  mentionIds?: string[];
}

/** Renders comment text with @-mention pills resolved against the AuthContext usersMap. */
export function CommentBody({ text, mentionIds = [] }: CommentBodyProps) {
  const { usersMap } = useAuth();
  const segments = useMemo(
    () => renderCommentSegments(text, mentionIds, (id) => usersMap.get(id)),
    [text, mentionIds, usersMap],
  );
  return (
    <p className="whitespace-pre-wrap break-words text-left text-sm text-body">
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <span
            key={i}
            className="inline-flex items-center px-1 rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200 font-medium"
          >
            @{seg.displayName}
          </span>
        ),
      )}
    </p>
  );
}
