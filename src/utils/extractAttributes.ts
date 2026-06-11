import type { TagAttribute, TransactionRow } from '../types';
import { applyTransformation } from './transformations';

/**
 * Convert a raw row value to the string the extractor should see.
 *
 * `Amount` is stored as a JavaScript number on the row (e.g. 30000), so
 * `String(value)` drops the trailing-zero decimal that the operator sees
 * in the table (the Debit/Credit columns format with `.toFixed(2)` plus
 * `toLocaleString()` for the commas). Without this normalization, an
 * "Extract full field" on Amount produces "30000" while the table
 * displays "30,000.00" — the decimal precision visible in the UI
 * silently vanishes from the extracted value. Formatting at the
 * extractor boundary means everything downstream (regex matching,
 * transformations, distinct-value popups) sees "30000.00" consistently.
 *
 * Commas from `toLocaleString` are intentionally NOT applied here —
 * they're locale display sugar, not part of the value.
 */
export function stringifyFieldValue(sourceField: string, value: unknown): string {
  if (sourceField === 'Amount' && typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  return String(value);
}

/**
 * Run a regex against the field string and return the LAST defined capture
 * group, or null if the regex doesn't match. The "last defined" rule (vs.
 * always taking group 1) matters for user-authored patterns like
 * `(?:.*?/(.*)){3}(/(.*))` where the intended value sits in a later group
 * rather than the iteration-reused group 1.
 *
 * Returns the literal empty string when the match captured no characters
 * (distinct from null / "no match at all"). Callers that care about the
 * difference (e.g. retry-on-empty for the lazy `(?:X|$)` shape) can branch
 * on it; callers that don't can treat null and "" interchangeably.
 */
// Module-level RegExp cache for attribute extractions. Mirrors the
// cache in evaluateRuleSet — same rationale: extractAttributes runs
// once per matched definition per row, each definition can carry
// several attributes, and each attribute compiles its regex from a
// pattern string that rarely changes across rows. Without caching,
// `new RegExp(...)` allocated tens of thousands of identical regex
// objects during a Show-all over 44k rows. `null` marks patterns
// that previously failed to compile so we don't pay the throw cost
// on every subsequent row.
const EXTRACT_REGEX_CACHE: Map<string, RegExp | null> = new Map();

function compileExtractRegex(pattern: string): RegExp | null {
  const cached = EXTRACT_REGEX_CACHE.get(pattern);
  if (cached !== undefined) return cached;
  try {
    const r = new RegExp(pattern);
    EXTRACT_REGEX_CACHE.set(pattern, r);
    return r;
  } catch {
    EXTRACT_REGEX_CACHE.set(pattern, null);
    return null;
  }
}

function matchAndPickCapture(fieldString: string, regexStr: string): string | null {
  const regex = compileExtractRegex(regexStr);
  if (!regex) return null;
  const match = fieldString.match(regex);
  if (!match) return null;
  for (let i = match.length - 1; i >= 1; i--) {
    if (match[i] !== undefined) {
      return match[i];
    }
  }
  return null;
}

/**
 * Extracts attribute values from a matched transaction row.
 * Returns a record of { attributeTag → extracted value or null }.
 *
 * When no regex is set, uses the raw source field value.
 * After extraction, applies any configured transformations in order.
 */
export function extractAttributes(
  attributes: TagAttribute[],
  row: TransactionRow
): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  for (const attr of attributes) {
    // Constant-mode attribute: emit the literal value verbatim. Skips the
    // source-field lookup, regex engine, and transformation pipeline — none
    // of which apply (AttributeRuleExpression and Transformations are null
    // for these on the wire).
    if (attr.Constant != null) {
      result[attr.AttributeTag] = attr.Constant;
      continue;
    }
    if (!attr.AttributeRuleExpression) {
      result[attr.AttributeTag] = null;
      continue;
    }
    const sourceField = attr.AttributeRuleExpression.SourceField;
    const fieldValue = row[sourceField];
    if (fieldValue === undefined || fieldValue === null) {
      result[attr.AttributeTag] = null;
      continue;
    }

    let extracted: string | null;
    const regexStr = attr.AttributeRuleExpression.Regex;
    const rawFieldString = stringifyFieldValue(sourceField, fieldValue);

    // Pre-extraction transformation pipeline. Applied to the stringified
    // raw SourceField value BEFORE the extraction regex runs, so the
    // operator can normalize the input (trim, casing, prefix strip, etc.)
    // without bloating the regex. Identical runtime to the post-extraction
    // pipeline below — only the position in the chain differs. Missing
    // / empty pre-list falls through to the raw stringified value, which
    // matches the no-op behavior backwards-compatibility requires for
    // older saved attributes.
    let fieldString = rawFieldString;
    if (attr.PreExtractionTransformations && attr.PreExtractionTransformations.length > 0) {
      for (const t of attr.PreExtractionTransformations) {
        const argsRecord = Object.fromEntries(t.Args.map((a) => [a.Key, a.Value]));
        fieldString = applyTransformation(t.Method, argsRecord, fieldString);
      }
    }

    if (!regexStr) {
      // No extraction method — use the (pre-transformed) source field value
      extracted = fieldString;
    } else {
      try {
        extracted = matchAndPickCapture(fieldString, regexStr);
        // "Between X and (space-or-end)" patterns shaped like
        // `<prefix>(.*?)(?:<suffix>|$)` lazily capture an EMPTY string when
        // the prefix is immediately followed by the suffix character. The
        // operator's intent is the next non-suffix chunk — the backend
        // extracts it correctly post-check-in, so the displayed cell would
        // otherwise diverge from the saved truth. Retry once with a
        // greedy leading-suffix skip + non-empty capture and accept that
        // result if it pulls a real value out.
        if (extracted === '') {
          const eoiMatch = regexStr.match(/^(.*)\(\.\*\?\)\(\?:(.+?)\|\$\)$/);
          if (eoiMatch) {
            const head = eoiMatch[1];
            const suf = eoiMatch[2];
            const rewritten = `${head}(?:${suf})*(.+?)(?:${suf}|$)`;
            const retry = matchAndPickCapture(fieldString, rewritten);
            if (retry !== null && retry !== '') {
              extracted = retry;
            }
          }
        }
      } catch {
        extracted = null;
      }
    }

    // Apply transformation pipeline (array order = execution order)
    if (extracted !== null && attr.Transformations && attr.Transformations.length > 0) {
      for (const t of attr.Transformations) {
        const argsRecord = Object.fromEntries(t.Args.map((a) => [a.Key, a.Value]));
        extracted = applyTransformation(t.Method, argsRecord, extracted);
      }
    }

    result[attr.AttributeTag] = extracted;
  }

  return result;
}
