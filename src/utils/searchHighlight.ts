/** A segment of text returned from highlightSegments. `match` is true when
 *  the segment matches the search query (case-insensitive substring). */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Escape regex metacharacters so a user-typed query can safely become part
 *  of a RegExp. Defends against ReDoS by treating the query as a literal
 *  substring, never as a pattern. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split `text` into segments where each segment is either a literal match of
 * `query` (case-insensitive) or the surrounding non-matching text. Used to
 * render highlighted comment bodies in search results.
 *
 * - Empty / whitespace query returns one non-match segment with the full text.
 * - Matching preserves the original casing of the source text.
 * - Multiple occurrences are each captured as their own match segment.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const q = query.trim();
  if (!text) return [];
  if (!q) return [{ text, match: false }];

  const pattern = new RegExp(escapeRegex(q), 'gi');
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, m.index), match: false });
    }
    segments.push({ text: m[0], match: true });
    lastIndex = m.index + m[0].length;
    // Defend against zero-length matches (shouldn't happen with escaped literal,
    // but cheap insurance against infinite loops).
    if (m[0].length === 0) pattern.lastIndex += 1;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), match: false });
  }
  return segments;
}
