import { forwardRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { TagSpecCommentSearchResult } from '../../types/commentSearch';
import type { TagSpecLibrary } from '../../types/tagSpec';
import { buildBreadcrumb, breadcrumbToString } from '../../utils/searchBreadcrumb';
import { Avatar } from './Avatar';
import { formatCommentDate } from './formatDate';
import { HighlightText } from './HighlightText';

interface CommentSearchResultRowProps {
  result: TagSpecCommentSearchResult;
  query: string;
  libraryLookup: Map<string, TagSpecLibrary>;
  isFocused: boolean;
  onClick: () => void;
  onFocus: () => void;
}

function StatusPill({ status }: { status: string }) {
  const tone = (() => {
    const s = status.toUpperCase();
    if (s === 'RESOLVED') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    if (s === 'REJECTED') return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300';
  })();
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

/** One row in the comment search results list. Click selects the result and
 *  opens its thread. Arrow keys move focus between rows (handled by the
 *  parent panel through onFocus). */
export const CommentSearchResultRow = forwardRef<HTMLButtonElement, CommentSearchResultRowProps>(
  function CommentSearchResultRow({ result, query, libraryLookup, isFocused, onClick, onFocus }, ref) {
    const { usersMap } = useAuth();
    const crumb = buildBreadcrumb(result.Target, libraryLookup);
    const breadcrumbStr = breadcrumbToString(crumb, result.Target);
    const authorName = usersMap.get(result.AuthorUserId) ?? result.AuthorUserId;
    const dateStr = formatCommentDate(result.CreationDate);
    const showStatus = (result.Status ?? '').toUpperCase() !== 'ACTIVE';
    const isReply = result.Depth > 0;

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onFocus={onFocus}
        tabIndex={isFocused ? 0 : -1}
        className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors cursor-pointer ${
          isFocused
            ? 'border-cyan-300 dark:border-cyan-700 bg-cyan-50/60 dark:bg-cyan-900/20'
            : 'border-border bg-surface hover:bg-surface-hover'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="min-w-0 truncate text-[11px] font-medium text-muted">
            {breadcrumbStr || 'Unknown target'}
          </span>
          {showStatus && <StatusPill status={result.Status} />}
        </div>

        <div className="flex items-center gap-2 mb-1.5">
          <Avatar userId={result.AuthorUserId} displayName={authorName} size="sm" />
          <span className="text-xs font-medium text-body truncate">{authorName}</span>
          {dateStr && <span className="text-[11px] text-faint">· {dateStr}</span>}
        </div>

        {isReply && (
          <p className="text-[11px] italic text-muted mb-1 line-clamp-1">
            Reply in: {result.RootCommentPreview || '…'}
          </p>
        )}

        <p
          className="text-xs text-body leading-snug overflow-hidden break-words"
          style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3 }}
        >
          <HighlightText text={result.Comment} query={query} />
        </p>
      </button>
    );
  },
);
