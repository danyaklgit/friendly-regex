import type { RedactionRule } from '../../data/redactionRules';

/**
 * Apply a list of redaction rules to a text blob.
 *
 * Rules are applied in array order; later rules see already-redacted text. A
 * malformed regex doesn't throw — it logs a warning and leaves that one rule's
 * span untouched so the rest of the pipeline can run.
 *
 * `between` rules replace the **entire span from prefix through suffix inclusive**
 * with the replacement string. Example: `/ORDP/Acme Ltd/` with replacement
 * `*****OrderingPty*****` redacts to literally `*****OrderingPty*****` — the
 * delimiters are part of the replaced span, not preserved.
 */
export function redact(text: string, rules: RedactionRule[]): string {
  if (!text) return text;
  let out = text;
  for (const rule of rules) {
    if (rule.kind === 'regex') {
      try {
        out = out.replace(new RegExp(rule.pattern, rule.flags ?? 'g'), rule.replacement);
      } catch {
        // Bad pattern shouldn't break the rest of the pipeline.
        console.warn(`[redact] invalid regex in rule "${rule.name}": ${rule.pattern}`);
      }
    } else {
      // BETWEEN: match from prefix through suffix (non-greedy), replace whole span.
      // `[\s\S]*?` instead of `.*?` so multi-line spans match too.
      try {
        const span = new RegExp(
          escapeForRegex(rule.prefix) + '[\\s\\S]*?' + escapeForRegex(rule.suffix),
          'g',
        );
        out = out.replace(span, rule.replacement);
      } catch {
        console.warn(`[redact] failed to compile between rule "${rule.name}"`);
      }
    }
  }
  return out;
}

/** Escape regex metacharacters so a literal string can appear inside a pattern. */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
