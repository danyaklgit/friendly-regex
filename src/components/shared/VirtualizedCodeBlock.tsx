import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Renders a large block of monospaced text (e.g. a formatted JSON payload)
 * WITHOUT freezing the page: only the lines in view are mounted, and more
 * render as the user scrolls — the same windowing the transactions table
 * uses. A plain `<pre>{hugeString}</pre>` mounts one giant text node and
 * lays out every line at once, which locks the main thread for multi-MB
 * payloads.
 *
 * Lines do NOT wrap (`whitespace-pre`) so every row is exactly one line
 * tall — that keeps the window math exact (fixed `LINE_HEIGHT`) and lets
 * long lines scroll horizontally, the standard JSON-viewer feel. The inner
 * sizing box is at least as wide as the longest line (`ch` units, since the
 * font is monospace) so the horizontal scrollbar reaches the end of every
 * line.
 *
 * Windowing is done by hand (a scroll-offset + measured viewport height)
 * rather than a virtualization library so it has no ResizeObserver/layout
 * hard dependency: before the container is measured — first browser paint,
 * or a non-layout test environment — it falls back to `FALLBACK_VIEWPORT`
 * and renders a reasonable initial window instead of nothing.
 */

const LINE_HEIGHT = 18; // px — must match `lineHeight` on each row below.
const OVERSCAN = 24; // rows rendered beyond the viewport on each side.
const FALLBACK_VIEWPORT = 800; // px, used until the container is measured.
const PADDING_X_REM = 1.5; // px-3 on both sides = 0.75rem × 2.

interface VirtualizedCodeBlockProps {
  text: string;
  className?: string;
}

export function VirtualizedCodeBlock({ text, className }: VirtualizedCodeBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  const lines = useMemo(() => text.split('\n'), [text]);
  // Widest line drives the horizontal scroll extent. Monospace, so char
  // count maps directly to `ch` width; add the row's horizontal padding.
  const maxLen = useMemo(
    () => lines.reduce((m, l) => (l.length > m ? l.length : m), 0),
    [lines],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = lines.length;
  const effectiveH = viewportH || FALLBACK_VIEWPORT;
  const first = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
  const last = Math.min(total, Math.ceil((scrollTop + effectiveH) / LINE_HEIGHT) + OVERSCAN);

  const visible: number[] = [];
  for (let i = first; i < last; i++) visible.push(i);

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={`h-full overflow-auto custom-scrollbar bg-surface-tertiary text-body rounded border border-border ${className ?? ''}`}
    >
      <div
        style={{
          height: total * LINE_HEIGHT,
          position: 'relative',
          // At least the container width (so it fills when content is
          // short), but grows to fit the longest line so horizontal scroll
          // reaches the end of every row.
          minWidth: `calc(${maxLen}ch + ${PADDING_X_REM}rem)`,
        }}
      >
        {visible.map((i) => (
          <div
            key={i}
            className="absolute left-0 top-0 w-full px-3 font-mono text-xs whitespace-pre"
            style={{
              height: LINE_HEIGHT,
              lineHeight: `${LINE_HEIGHT}px`,
              transform: `translateY(${i * LINE_HEIGHT}px)`,
            }}
          >
            {/* Non-breaking space keeps blank lines from collapsing to 0px. */}
            {lines[i] === '' ? ' ' : lines[i]}
          </div>
        ))}
      </div>
    </div>
  );
}
