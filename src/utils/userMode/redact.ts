import type { RedactionRule } from '../../data/redactionRules';

/**
 * Apply a list of redaction rules to a text blob, returning the masked string.
 *
 * Rules are applied in array order; later rules see already-redacted text. A
 * malformed regex doesn't throw — it logs a warning and leaves that one rule's
 * span untouched so the rest of the pipeline can run.
 *
 * `between` rules replace the **entire span from prefix through suffix inclusive**
 * with the replacement string.
 *
 * This flat-string form is kept for callers/tests that want the plain masked
 * text. The UI renders via {@link redactSegments} instead, which preserves
 * which spans were redacted so they can be drawn as censor bars.
 */
export function redact(text: string, rules: RedactionRule[]): string {
  if (!text) return text;
  let out = text;
  for (const rule of rules) {
    const re = compileRuleRegex(rule);
    if (!re) continue;
    out = out.replace(re, rule.replacement);
  }
  return out;
}

export interface RedactSegment {
  /** Text to display. For redacted segments this is the rule's replacement label. */
  text: string;
  /** True when this segment was produced by a redaction rule (draw it as a bar). */
  redacted: boolean;
}

/**
 * Like {@link redact}, but returns the text split into ordered segments marking
 * which spans were redacted. The renderer ({@link RedactedText}) draws redacted
 * segments as solid black censor bars with the replacement label in white.
 *
 * Unlike the flat `redact`, an already-redacted segment is frozen: later rules
 * never re-match a replacement label (so e.g. an IBAN rule can't chew on the
 * word "Beneficiary"). Non-redacted spans are still processed by every rule.
 */
export function redactSegments(text: string, rules: RedactionRule[]): RedactSegment[] {
  if (!text) return [];
  let segments: RedactSegment[] = [{ text, redacted: false }];
  for (const rule of rules) {
    const re = compileRuleRegex(rule);
    if (!re) continue;
    const next: RedactSegment[] = [];
    for (const seg of segments) {
      if (seg.redacted) {
        next.push(seg);
        continue;
      }
      next.push(...splitByRegex(seg.text, re, rule.replacement));
    }
    segments = next;
  }
  return segments;
}

/** Split a string into redacted/non-redacted segments around every match. */
function splitByRegex(text: string, re: RegExp, replacement: string): RedactSegment[] {
  const out: RedactSegment[] = [];
  let lastIndex = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push({ text: text.slice(lastIndex, m.index), redacted: false });
    }
    out.push({ text: replacement, redacted: true });
    lastIndex = m.index + m[0].length;
    // Guard against zero-length matches looping forever.
    if (m[0].length === 0) re.lastIndex++;
  }
  if (lastIndex < text.length) {
    out.push({ text: text.slice(lastIndex), redacted: false });
  }
  return out;
}

/**
 * Compile a rule into a global RegExp. `between` rules become a non-greedy
 * prefix-through-suffix span (`[\s\S]*?` so multi-line spans match). Returns
 * null (and warns) on a malformed pattern so the pipeline can skip it.
 */
function compileRuleRegex(rule: RedactionRule): RegExp | null {
  try {
    if (rule.kind === 'regex') {
      let flags = rule.flags ?? 'g';
      if (!flags.includes('g')) flags += 'g';
      return new RegExp(rule.pattern, flags);
    }
    return new RegExp(
      escapeForRegex(rule.prefix) + '[\\s\\S]*?' + escapeForRegex(rule.suffix),
      'g',
    );
  } catch {
    console.warn(`[redact] invalid rule "${rule.name}"`);
    return null;
  }
}

/** Escape regex metacharacters so a literal string can appear inside a pattern. */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
