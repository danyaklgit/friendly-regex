import { useMemo, useState } from 'react';
import { RedactedText } from './RedactedText';

interface DescriptionCellProps {
  text: string;
}

/**
 * Description column for the user-mode table.
 *   1. Strips MT940 "NONREF" placeholder tokens — they carry no information and
 *      only add noise to the narrative.
 *   2. Renders through `RedactedText`, so the redaction toggle masks IBANs,
 *      beneficiary spans, etc. as black censor bars.
 *   3. Clamps to three lines by default with an inline "Show more / Show less"
 *      toggle so the user stays in their row context.
 */
export function DescriptionCell({ text }: DescriptionCellProps) {
  const [expanded, setExpanded] = useState(false);
  const cleaned = useMemo(() => stripNonRef(text), [text]);

  if (!cleaned) return <span className="text-faint">—</span>;

  return (
    <div className="text-xs text-body leading-relaxed">
      <p className={expanded ? 'whitespace-pre-wrap' : 'line-clamp-3 whitespace-pre-wrap'}>
        <RedactedText text={cleaned} />
      </p>
      {/* Render the toggle only when the text is actually long enough that
          clamping does any work. Cheap heuristic: ~3 lines at ~80ch ≈ 240 chars. */}
      {cleaned.length > 200 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] text-primary hover:underline focus:outline-none"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

/** Remove standalone "NONREF" tokens (the MT940 "no reference" placeholder)
 *  and tidy the separators/whitespace they leave behind. */
function stripNonRef(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bNONREF\b/gi, '')
    .replace(/[^\S\n]{2,}/g, ' ') // collapse runs of spaces/tabs (keep newlines)
    .replace(/\/{2,}/g, '/') // collapse slash runs left by the removal
    .trim();
}
