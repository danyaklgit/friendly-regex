import { useState, type MouseEvent } from 'react';
import { Tooltip } from './Tooltip';

interface CopyableIdProps {
  id: string;
  /** Number of characters to show before truncating with an ellipsis. Default 8. */
  truncateAt?: number;
  /** Optional class to override default text styling. */
  className?: string;
  /**
   * Visual prominence:
   *  - "subtle" (default): muted faint text, blends with surrounding meta.
   *  - "default": body-secondary text, more legible against tinted backgrounds.
   */
  tone?: 'subtle' | 'default';
}

/**
 * Compact, subtle inline display of an identifier with click-to-copy.
 *
 * Renders the first N characters of the id (default 8) in faint monospace,
 * followed by a small copy icon. Hovering reveals the full id in a tooltip.
 * Clicking copies the full id to the clipboard and briefly swaps the label
 * to "Copied" as feedback.
 *
 * Uses a role="button" span (not a real <button>) so it can safely live
 * inside another clickable container without nesting interactive elements.
 * stopPropagation prevents the outer container's onClick from firing when
 * the user clicks the id.
 */
export function CopyableId({ id, truncateAt = 8, className = '', tone = 'subtle' }: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
        // Fallback for environments without async clipboard API.
        const textarea = document.createElement('textarea');
        textarea.value = id;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — silent. Hover tooltip still shows the value.
    }
  };

  const display = id.length > truncateAt ? `${id.slice(0, truncateAt)}…` : id;
  // Reserve the width of the longer label (the truncated id) on the OUTER
  // pill so swapping to "Copied" doesn't make it shrink and reflow whatever
  // sits next to it. Putting min-width on the outer (not the inner text
  // span) keeps the icon flush against the text in both states. The 1.5rem
  // term accounts for the icon (~12px) + gap (4px) + a small buffer so the
  // natural content width never exceeds the reservation.
  const outerMinWidth = `calc(${display.length}ch + 1.5rem)`;

  return (
    <Tooltip content={<span className="font-mono text-[10px] break-all">{id}</span>} placement="top">
      <span
        role="button"
        tabIndex={-1}
        onClick={handleCopy}
        aria-label={copied ? 'Id copied' : `Copy id ${id}`}
        style={{ minWidth: outerMinWidth }}
        className={`inline-flex items-center gap-1 text-[10px] font-mono leading-none transition-colors cursor-pointer select-none
          ${copied
            ? 'text-emerald-500'
            : tone === 'default'
              ? 'text-body-secondary hover:text-primary'
              : 'text-faint hover:text-primary'}
          ${className}`}
      >
        <span>{copied ? 'Copied' : display}</span>
        {copied ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </span>
    </Tooltip>
  );
}
