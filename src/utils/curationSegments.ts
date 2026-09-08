import type { CurationSpan, KeyToken, KeyTokenField } from '../api/sampling';

/**
 * Curation Studio segment model (2026-09-08, UI_Curation_Studio.md §2).
 *
 * The studio edits each field as a list of SEGMENTS over the transaction's
 * ORIGINAL text: a segment is either literal text (kept verbatim, whitespace
 * and all — gotcha #29) or a pill (a typed token standing in for the covered
 * text). Segments always cover the field's text completely and in order, so
 * the operator sees the real narrative with pills dropped into place, and
 * "remove pill" restores the exact original characters.
 *
 * The key sent to the backend is DERIVED from the segments of the selected
 * fields (`segmentsToTokens`): literals trimmed, glue decided by whether any
 * whitespace separates neighbours in the original text.
 */

/** A pill's identity — Field/Glued are derived, never stored on a segment. */
export type SegmentPill = {
  Kind: 'Placeholder' | 'List';
  Text: string;
  Item?: string | null;
  Length?: number | null;
};

export interface CurationSegment {
  /** The original text this segment covers, verbatim. */
  text: string;
  /** Null = literal text; a pill replaces the covered text in the key. */
  token: SegmentPill | null;
}

/** Initial segments from a draft field's Spans (render these — never
 *  re-tokenise the string). Literal spans become literal segments. */
export function segmentsFromSpans(spans: CurationSpan[]): CurationSegment[] {
  return spans.map((s) => ({
    text: s.Text,
    token:
      s.Token.Kind === 'Literal'
        ? null
        : { Kind: s.Token.Kind, Text: s.Token.Text, Item: s.Token.Item ?? null, Length: s.Token.Length ?? null },
  }));
}

/** "Reset to the transaction's text": one literal segment, no pills. */
export function segmentsFromText(text: string): CurationSegment[] {
  return text ? [{ text, token: null }] : [];
}

/** The full original text the segments cover (invariant: never changes). */
export function segmentsText(segments: CurationSegment[]): string {
  return segments.map((s) => s.text).join('');
}

function mergeAdjacentLiterals(segments: CurationSegment[]): CurationSegment[] {
  const out: CurationSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (prev && !prev.token && !seg.token) {
      out[out.length - 1] = { text: prev.text + seg.text, token: null };
    } else {
      out.push(seg);
    }
  }
  return out;
}

/**
 * Replace the [start, end) character range of the literal segment at `index`
 * with a pill covering exactly that text. Returns a new array, or null when
 * the target isn't a literal or the range is out of bounds/empty.
 */
export function replaceRangeWithPill(
  segments: CurationSegment[],
  index: number,
  start: number,
  end: number,
  pill: SegmentPill,
): CurationSegment[] | null {
  const seg = segments[index];
  if (!seg || seg.token) return null;
  if (start < 0 || end > seg.text.length || start >= end) return null;
  const pieces: CurationSegment[] = [];
  const before = seg.text.slice(0, start);
  const after = seg.text.slice(end);
  if (before) pieces.push({ text: before, token: null });
  pieces.push({ text: seg.text.slice(start, end), token: pill });
  if (after) pieces.push({ text: after, token: null });
  return segments.slice(0, index).concat(pieces, segments.slice(index + 1));
}

/** Swap the pill at `index` for another (same covered text). */
export function replacePillAt(
  segments: CurationSegment[],
  index: number,
  pill: SegmentPill,
): CurationSegment[] | null {
  const seg = segments[index];
  if (!seg || !seg.token) return null;
  const out = segments.slice();
  out[index] = { text: seg.text, token: pill };
  return out;
}

/** Remove the pill at `index`: the covered text returns as a literal and
 *  fuses with its literal neighbours, so a later selection can span the seam. */
export function removePillAt(segments: CurationSegment[], index: number): CurationSegment[] | null {
  const seg = segments[index];
  if (!seg || !seg.token) return null;
  const out = segments.slice();
  out[index] = { text: seg.text, token: null };
  return mergeAdjacentLiterals(out);
}

/**
 * Normalize a DOM-derived selection (two segment/offset pairs, any direction)
 * into a pill-able range: must fall inside ONE literal segment, shrunk to
 * exclude leading/trailing whitespace. Null when it can't become a pill
 * (crosses a pill, empty, whitespace-only).
 */
export function normalizeSelection(
  segments: CurationSegment[],
  aSeg: number,
  aOff: number,
  bSeg: number,
  bOff: number,
): { index: number; start: number; end: number; text: string } | null {
  if (aSeg !== bSeg) return null;
  const seg = segments[aSeg];
  if (!seg || seg.token) return null;
  let start = Math.max(0, Math.min(aOff, bOff));
  let end = Math.min(seg.text.length, Math.max(aOff, bOff));
  while (start < end && /\s/.test(seg.text[start])) start++;
  while (end > start && /\s/.test(seg.text[end - 1])) end--;
  if (start >= end) return null;
  return { index: aSeg, start, end, text: seg.text.slice(start, end) };
}

/**
 * Derive the field's key tokens from its segments: pills as-is, literal
 * segments trimmed to one Literal token each (empty ones dropped). A token is
 * Glued to its predecessor when NO whitespace separates them in the original
 * text — that is what makes a pill inside a word split it (hand-off §3.2).
 */
export function segmentsToTokens(field: KeyTokenField, segments: CurationSegment[]): KeyToken[] {
  const out: KeyToken[] = [];
  // True while whitespace (or nothing-yet) separates the next token from the
  // previous one.
  let gap = true;
  for (const seg of segments) {
    if (seg.token) {
      out.push({
        Field: field,
        Kind: seg.token.Kind,
        Text: seg.token.Text,
        ...(seg.token.Item != null ? { Item: seg.token.Item } : {}),
        ...(seg.token.Length != null ? { Length: seg.token.Length } : {}),
        Glued: out.length > 0 && !gap,
      });
      gap = false;
    } else {
      if (/^\s/.test(seg.text)) gap = true;
      const trimmed = seg.text.trim();
      if (trimmed) {
        out.push({ Field: field, Kind: 'Literal', Text: trimmed, Glued: out.length > 0 && !gap });
        gap = /\s$/.test(seg.text);
      } else if (seg.text.length > 0) {
        gap = true;
      }
    }
  }
  return out;
}

/** True when any segment is a pill or differs from the plain original text —
 *  i.e. the operator has started shaping this field. */
export function segmentsHavePills(segments: CurationSegment[]): boolean {
  return segments.some((s) => s.token !== null);
}
