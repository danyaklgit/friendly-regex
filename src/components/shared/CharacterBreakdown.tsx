/**
 * CharacterBreakdown — a logical-order "letter by letter" inspector.
 *
 * Mixed Arabic/English narratives render in VISUAL order (the browser's bidi
 * algorithm), which differs from the LOGICAL (stored) order that extraction
 * and position-based transformations operate on. This component lays the text
 * out one character per cell, ALWAYS left-to-right in logical order, with each
 * cell direction-isolated so bidi reordering can't apply. An optional
 * `highlight` range tints the captured span, and an index ruler lets the
 * operator read true character offsets when choosing positions.
 *
 * Display only — never mutates or re-encodes the text.
 */
import { containsRtl } from '../../utils/bidi';

interface Range {
  /** 0-based, inclusive. */
  start: number;
  /** 0-based, exclusive. */
  end: number;
}

/**
 * Renders `text` (in `dir="auto"` so its base direction is detected per value)
 * with an optional `highlight` span wrapped in `<mark>`, so the operator sees
 * exactly which characters a rule captures on the real narrative — direction
 * notwithstanding. Long text is windowed around the highlight with ellipses so
 * the captured span is always visible.
 */
export function HighlightedText({
  text,
  highlight,
  maxLen = 320,
  className = '',
}: {
  text: string;
  highlight?: Range | null;
  maxLen?: number;
  className?: string;
}) {
  let start = 0;
  let end = text.length;
  if (text.length > maxLen) {
    if (highlight) {
      start = Math.max(0, highlight.start - 100);
      end = Math.min(text.length, start + maxLen);
    } else {
      end = maxLen;
    }
  }
  const lead = start > 0;
  const trail = end < text.length;
  const win = text.slice(start, end);

  let body;
  if (highlight && highlight.end > highlight.start) {
    const hs = Math.max(0, highlight.start - start);
    const he = Math.max(hs, Math.min(win.length, highlight.end - start));
    body = (
      <>
        {win.slice(0, hs)}
        <mark className="bg-primary/20 dark:bg-primary/40 rounded-sm px-0.5 text-heading dark:text-primary-light">
          {win.slice(hs, he)}
        </mark>
        {win.slice(he)}
      </>
    );
  } else {
    body = win;
  }

  return (
    <code dir="auto" className={className}>
      "{lead ? '…' : ''}{body}{trail ? '…' : ''}"
    </code>
  );
}

interface CharacterBreakdownProps {
  text: string;
  /** Captured / extracted span to tint (e.g. the regex group). */
  highlight?: Range | null;
  /** Hard cap on rendered cells so a long narrative can't explode the DOM. */
  maxChars?: number;
  /** Compact: drop the header and per-cell index ruler (just the isolated
   *  characters). Used for in-table cells where vertical space is tight. */
  compact?: boolean;
  className?: string;
}

const inRange = (i: number, r?: Range | null) => !!r && i >= r.start && i < r.end;

export function CharacterBreakdown({ text, highlight, maxChars = 240, compact = false, className = '' }: CharacterBreakdownProps) {
  const truncated = text.length > maxChars;
  const shown = truncated ? text.slice(0, maxChars) : text;
  const chars = [...shown];

  return (
    <div className={`rounded-lg border border-border bg-surface-secondary ${compact ? 'p-1' : 'p-2'} ${className}`}>
      {!compact && (
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide">
            Characters (logical order)
          </p>
          {highlight && highlight.end > highlight.start && (
            <span className="text-[10px] text-faint">
              extracted: positions {highlight.start}–{highlight.end - 1}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-0.5 overflow-x-auto">
        {chars.map((ch, i) => {
          const isSpace = ch === ' ';
          const highlighted = inRange(i, highlight);
          // Index label under every 10th cell, the boundaries of the
          // highlight, and the first cell — enough to count by without
          // cluttering every column. Suppressed in compact mode.
          const showIndex =
            !compact &&
            (i === 0 ||
              i % 10 === 0 ||
              (highlight ? i === highlight.start || i === highlight.end - 1 : false));
          return (
            <div key={i} className="flex flex-col items-center" title={`position ${i}`}>
              <span
                dir="ltr"
                style={{ unicodeBidi: 'isolate' }}
                className={`flex items-center justify-center min-w-[1.1rem] h-5 px-0.5 rounded font-mono text-xs leading-none border ${
                  highlighted
                    ? 'bg-primary/20 dark:bg-primary/40 border-primary/40 text-heading dark:text-primary-light'
                    : 'bg-surface border-border text-body-secondary'
                }`}
              >
                {isSpace ? <span className="text-faint">·</span> : ch}
              </span>
              {!compact && (
                <span className="h-3 text-[9px] leading-none text-faint mt-0.5 tabular-nums">
                  {showIndex ? i : ''}
                </span>
              )}
            </div>
          );
        })}
        {truncated && (
          <span className="self-center text-[10px] text-faint ml-1">
            …(+{text.length - maxChars} more)
          </span>
        )}
      </div>
    </div>
  );
}

/** Split text into maximal runs of RTL vs non-RTL characters, tracking each
 *  run's UTF-16 start index so highlight ranges (from regex `match.index`)
 *  line up. Indexed by UTF-16 unit; narratives are BMP so unit == char. */
function segmentByRtl(text: string): { rtl: boolean; text: string; start: number }[] {
  const segments: { rtl: boolean; text: string; start: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const rtl = containsRtl(ch);
    const last = segments[segments.length - 1];
    if (last && last.rtl === rtl) last.text += ch;
    else segments.push({ rtl, text: ch, start: i });
  }
  return segments;
}

const MARK_CLASS =
  'bg-primary/20 dark:bg-primary/40 rounded-sm text-heading dark:text-primary-light font-medium ring-1 ring-primary/40 dark:ring-primary/70';

/** Group a segment's chars into consecutive highlighted / non-highlighted runs. */
function splitByHighlight(segText: string, segStart: number, ranges: ReadonlyArray<readonly [number, number]>) {
  const runs: { hi: boolean; text: string }[] = [];
  for (let k = 0; k < segText.length; k++) {
    const idx = segStart + k;
    const hi = ranges.some(([s, e]) => idx >= s && idx < e);
    const last = runs[runs.length - 1];
    if (last && last.hi === hi) last.text += segText[k];
    else runs.push({ hi, text: segText[k] });
  }
  return runs;
}

/**
 * Inline bidi-aware renderer for table cells: leaves LTR (English/number) runs
 * as normal flowing text and breaks ONLY the RTL (Arabic) runs into per-char,
 * direction-isolated cells laid out in logical L→R order. This keeps the cell
 * compact (the English dominates and stays plain) while still showing the
 * Arabic in unambiguous logical order so splitting positions are clear.
 *
 * `highlightRanges` (UTF-16 [start, end) spans from the rule/search match) are
 * tinted the same way plain cells highlight: matched LTR text wrapped in
 * `<mark>`, matched Arabic char-cells filled with the primary tint.
 */
export function SegmentedRtlText({
  text,
  highlightRanges = [],
  className = '',
}: {
  text: string;
  highlightRanges?: ReadonlyArray<readonly [number, number]>;
  className?: string;
}) {
  const segments = segmentByRtl(text);
  const hiAt = (i: number) => highlightRanges.some(([s, e]) => i >= s && i < e);
  return (
    <div dir="auto" className={`whitespace-pre-wrap break-words leading-6 ${className}`}>
      {segments.map((seg, si) =>
        seg.rtl ? (
          <span key={si} className="inline-flex flex-wrap gap-0.5 align-middle mx-0.5">
            {[...seg.text].map((ch, i) => {
              const hi = hiAt(seg.start + i);
              return (
                <span
                  key={i}
                  dir="ltr"
                  style={{ unicodeBidi: 'isolate' }}
                  className={`flex items-center justify-center min-w-[1.1rem] h-5 px-0.5 rounded font-mono text-xs leading-none border ${
                    hi
                      ? 'bg-primary/20 dark:bg-primary/40 border-primary/40 text-heading dark:text-primary-light'
                      : 'bg-surface border-border text-body-secondary'
                  }`}
                >
                  {ch}
                </span>
              );
            })}
          </span>
        ) : (
          <span key={si}>
            {splitByHighlight(seg.text, seg.start, highlightRanges).map((run, ri) =>
              run.hi ? (
                <mark key={ri} className={MARK_CLASS}>
                  {run.text}
                </mark>
              ) : (
                <span key={ri}>{run.text}</span>
              ),
            )}
          </span>
        ),
      )}
    </div>
  );
}
