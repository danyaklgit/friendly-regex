import { useMemo, useState } from 'react';
import { useUserMode } from '../../context/UserModeContext';
import { redact } from '../../utils/userMode/redact';
import { REDACTION_RULES } from '../../data/redactionRules';

interface DescriptionCellProps {
  text: string;
}

/**
 * Description column for the user-mode table. Three responsibilities:
 *   1. Apply the bundled redaction rules when `redactionOn` (from UserModeContext)
 *      is true. The redacted string is shown verbatim; the raw value is only
 *      ever visible after the user clears the password gate.
 *   2. Clamp to three lines by default with a "Show more / Show less" toggle.
 *      Pure inline expand — no modal — so the user stays in their row context.
 *   3. Render an empty cell when the description is missing so the row doesn't
 *      grow a vestigial toggle for "Show 0 more lines".
 */
export function DescriptionCell({ text }: DescriptionCellProps) {
  const { redactionOn } = useUserMode();
  const [expanded, setExpanded] = useState(false);

  const display = useMemo(
    () => (redactionOn ? redact(text, REDACTION_RULES) : text),
    [text, redactionOn],
  );

  if (!display) return <span className="text-faint">—</span>;

  return (
    <div className="text-xs text-body leading-relaxed">
      <p className={expanded ? 'whitespace-pre-wrap' : 'line-clamp-3 whitespace-pre-wrap'}>{display}</p>
      {/* Render the toggle only when the text is actually long enough that
          clamping does any work. Cheap heuristic: ~3 lines at ~80ch ≈ 240 chars. */}
      {display.length > 200 && (
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
