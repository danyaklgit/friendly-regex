interface CommentSearchTriggerProps {
  onClick: () => void;
  /** Tooltip text. Defaults to "Search comments". */
  title?: string;
  /** Visual size — defaults to the same dimensions used in toolbar buttons. */
  size?: 'sm' | 'md';
}

function SearchInBubbleIcon({ size }: { size: number }) {
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
      <circle cx="11" cy="10" r="2.5" />
      <path d="m13.4 12.4 2 2" />
    </svg>
  );
}

/**
 * Icon-only button that opens the comment search panel. Used in the Backlog
 * header, the Transactions toolbar, and the wizard modal header. Keeps the
 * look uniform across all three surfaces.
 */
export function CommentSearchTrigger({ onClick, title = 'Search comments', size = 'md' }: CommentSearchTriggerProps) {
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <button
      type="button"
      data-tour="comment-search-trigger"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full cursor-pointer transition-all duration-150 hover:scale-110 active:scale-95 ${dim} text-cyan-700 dark:text-cyan-300 bg-cyan-50/60 dark:bg-cyan-900/30 ring-1 ring-cyan-200/70 dark:ring-cyan-800/50 hover:bg-cyan-100 dark:hover:bg-cyan-900/50`}
    >
      <SearchInBubbleIcon size={iconSize} />
    </button>
  );
}
