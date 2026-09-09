/**
 * `[_TEP_]`-separated field bags (2026-09-09).
 *
 * The INTERIM_TransactionsList ingestion flattens the payload's
 * `additionalInformation` object into ONE text column: `key: value` pairs
 * joined by the literal ` [_TEP_] ` (single space on each side). Example:
 *
 *   uniqueId: SD824475402-09-2026   2C [_TEP_] narrative.narr1: ... [_TEP_] partTrnType: CREDIT
 *
 * This module is the single parser for that shape. Consumers:
 *  - TransactionTable renders each pair on its own line (offsets here let it
 *    slice precomputed highlight ranges per line without re-matching).
 *  - ConditionEditor's "Advanced options" dropdown lists the keys so the
 *    operator can prefix a Contains/Equals value with `key: `.
 *  - The attribute pre-extraction prefill (Split & Pick on `[_TEP_]` →
 *    Replace `key:` → Trim) resolves a picked key to its split index.
 *
 * Values inside a pair keep their padding runs verbatim (gotcha #29) — only
 * the single join space on each side of a separator is stripped, because it
 * belongs to the join, not to the value.
 */

export const TEP_BAG_SEPARATOR = '[_TEP_]';

export interface TepBagEntry {
  /** Parsed key (the identifier before the first `:`), or null when the part
   *  doesn't lead with a `key:` shape. */
  key: string | null;
  /** Value text after `key: ` (join spaces stripped, internal padding kept). */
  value: string;
  /** The whole `key: value` pair with the join spaces stripped. */
  text: string;
  /** 0-based position of the part in a plain `split('[_TEP_]')` — this is the
   *  index Split & Pick uses at runtime, so it must NOT skip empty parts. */
  index: number;
  /** [start, end) of `text` within the ORIGINAL string. */
  start: number;
  end: number;
  /** Absolute offset where `value` begins in the ORIGINAL string (equals
   *  `start` when the part has no key). */
  valueStart: number;
}

/** True when the value is a string carrying at least one bag separator. */
export function isTepBagText(value: unknown): value is string {
  return typeof value === 'string' && value.includes(TEP_BAG_SEPARATOR);
}

// A key is a single identifier-ish token (letters/digits/underscore, dots for
// nesting like `narrative.narr1`, plus the odd `-`/`$`) followed by a colon
// and at most one space. Anything with spaces before the colon is treated as
// plain text, not a key.
const KEY_RE = /^([A-Za-z0-9_$][A-Za-z0-9_.$-]*): ?/;

/**
 * Split a bag string into its entries with exact source offsets. Returns []
 * when the string carries no separator, so callers can use the empty result
 * as the "not a bag" signal.
 */
export function parseTepBag(text: string): TepBagEntry[] {
  if (!text.includes(TEP_BAG_SEPARATOR)) return [];
  const entries: TepBagEntry[] = [];
  let partStart = 0;
  let index = 0;
  // Iterate parts by separator position so offsets stay exact.
  for (;;) {
    const sep = text.indexOf(TEP_BAG_SEPARATOR, partStart);
    const partEnd = sep === -1 ? text.length : sep;
    let start = partStart;
    let end = partEnd;
    // Strip ONLY the single join space each side of a separator; a part's own
    // padding runs stay part of the value.
    if (index > 0 && text[start] === ' ') start += 1;
    if (sep !== -1 && end > start && text[end - 1] === ' ') end -= 1;
    const partText = text.slice(start, end);
    const m = partText.match(KEY_RE);
    entries.push({
      key: m ? m[1] : null,
      value: m ? partText.slice(m[0].length) : partText,
      text: partText,
      index,
      start,
      end,
      valueStart: m ? start + m[0].length : start,
    });
    if (sep === -1) break;
    partStart = sep + TEP_BAG_SEPARATOR.length;
    index += 1;
  }
  return entries;
}

// Deriving the key list scans loaded rows; cap the walk so a Show-all buffer
// of tens of thousands of rows doesn't make every memo re-run expensive. Keys
// are structural (the ingestion emits the same bag shape per feed), so the
// first few hundred rows see them all.
const KEY_SCAN_ROW_LIMIT = 500;

/**
 * Union of bag keys across the loaded rows' `field` values, in first-seen
 * order. Empty when no row carries a bag — the gate callers use to decide
 * whether to surface the bag-aware UI at all.
 */
export function tepBagKeys(
  rows: readonly Record<string, unknown>[] | undefined,
  field = 'AdditionalInformation',
): string[] {
  if (!rows || rows.length === 0) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  const limit = Math.min(rows.length, KEY_SCAN_ROW_LIMIT);
  for (let i = 0; i < limit; i++) {
    const v = rows[i][field];
    if (!isTepBagText(v)) continue;
    for (const entry of parseTepBag(v)) {
      if (entry.key && !seen.has(entry.key)) {
        seen.add(entry.key);
        keys.push(entry.key);
      }
    }
  }
  return keys;
}
