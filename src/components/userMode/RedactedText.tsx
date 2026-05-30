import { useUserMode } from '../../context/UserModeContext';
import { redactSegments } from '../../utils/userMode/redact';
import { REDACTION_RULES } from '../../data/redactionRules';

interface RedactedTextProps {
  text: string;
  /** Class applied to the non-redacted text spans (inherits cell typography). */
  className?: string;
}

/**
 * Renders text with the bundled redaction rules applied as solid black censor
 * bars (white label on black, Epstein-files style) when `redactionOn` is true.
 * When redaction is off, or the text matches no rule, it renders verbatim.
 *
 * Used across every text-bearing cell in the user table (account number,
 * description, attributes, …) so a single toggle masks all personal data
 * consistently. The bar shows the rule's replacement label ("IBAN",
 * "Beneficiary", …) so the reader knows WHAT was hidden without seeing it.
 */
export function RedactedText({ text, className }: RedactedTextProps) {
  const { redactionOn } = useUserMode();

  if (!text) return null;
  if (!redactionOn) return <span className={className}>{text}</span>;

  const segments = redactSegments(text, REDACTION_RULES);
  return (
    <>
      {segments.map((seg, i) =>
        seg.redacted ? (
          <span
            key={i}
            className="inline-flex items-center rounded-xs bg-black px-1 align-baseline text-[0.95em] font-medium leading-snug text-white"
            title="Redacted"
          >
            {seg.text}
          </span>
        ) : (
          <span key={i} className={className}>{seg.text}</span>
        ),
      )}
    </>
  );
}
