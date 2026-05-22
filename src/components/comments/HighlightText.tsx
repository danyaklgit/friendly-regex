import { Fragment } from 'react';
import { highlightSegments } from '../../utils/searchHighlight';

interface HighlightTextProps {
  text: string;
  query: string;
  className?: string;
}

/** Render `text` with substrings matching `query` (case-insensitive) wrapped in
 *  a highlighted <mark> span. Safe against ReDoS, defended in highlightSegments. */
export function HighlightText({ text, query, className }: HighlightTextProps) {
  const segments = highlightSegments(text, query);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className="bg-amber-200/70 dark:bg-amber-400/30 text-inherit rounded-sm px-[1px]"
          >
            {seg.text}
          </mark>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </span>
  );
}
