import type { CurationSpan, KeyToken, KeyTokenField } from '../api/sampling';

/**
 * Curation Studio segment model v2 (2026-09-08,
 * UI_Curation_Studio_Editing.md §3).
 *
 * A selected field is a list of SEGMENTS, in order. Four kinds:
 *
 *  - KEPT WORDS   — source text, in the key (`token: null, inKey, !inserted`)
 *  - PILL         — source text covered by a typed token (`token, inKey`)
 *  - EXCLUDED     — source text NOT in the key, struck through
 *                   (`token: null, !inKey, !inserted`)
 *  - INSERTED     — a key token nowhere in the source text: typed words
 *                   (`token: null`) or an added pill (`token`), with its own
 *                   `glued` flag ("attach to previous, no space").
 *
 * Invariant: the concatenation of the NON-inserted segments' text is the
 * field's original text, unchanged (gotcha #29) — so "Reset to the
 * transaction's text" and "Back to the exact words" restore the exact
 * characters. Inserted segments carry their own text ('' for a pill).
 *
 * The key sent to the backend is DERIVED (`segmentsToTokens`): kept words and
 * pills in order, an excluded run BETWEEN two emitted tokens becomes one
 * `<ANY>` token (leading/trailing runs just shorten the key), inserted
 * segments take their glue from their own flag.
 */

/** A pill's identity — Field/Glued are derived, never stored on a segment. */
export type SegmentPill = {
  Kind: 'Placeholder' | 'List';
  Text: string;
  Item?: string | null;
  Length?: number | null;
};

export interface CurationSegment {
  /** Source text covered (verbatim); for inserted words the TYPED text; ''
   *  for an inserted pill. */
  text: string;
  token: SegmentPill | null;
  /** false = excluded source text (struck through, contributes nothing).
   *  Inserted segments are always in the key. */
  inKey: boolean;
  /** true = not backed by source text (typed words / added pill). */
  inserted: boolean;
  /** Inserted segments only: attach to the previous token with no space. */
  glued: boolean;
}

const kept = (text: string): CurationSegment => ({ text, token: null, inKey: true, inserted: false, glued: false });
const excluded = (text: string): CurationSegment => ({ text, token: null, inKey: false, inserted: false, glued: false });

function pillOf(token: KeyToken | SegmentPill): SegmentPill | null {
  if (token.Kind === 'Literal') return null;
  return { Kind: token.Kind, Text: token.Text, Item: token.Item ?? null, Length: token.Length ?? null };
}

/** Initial segments from a draft field's Spans (render these — never
 *  re-tokenise the string). Reopened curations come back aligned to the SAVED
 *  key: excluded spans carry `InKey: false`, typed words / added pills carry
 *  `Inserted: true`. */
export function segmentsFromSpans(spans: CurationSpan[]): CurationSegment[] {
  return spans.map((s) => ({
    text: s.Text,
    token: s.Token.Kind === 'Literal' ? null : pillOf(s.Token),
    inKey: s.InKey !== false,
    inserted: s.Inserted === true,
    glued: s.Inserted === true ? (s.Token.Glued ?? false) : false,
  }));
}

/** "Reset to the transaction's text": one kept segment, no pills. */
export function segmentsFromText(text: string): CurationSegment[] {
  return text ? [kept(text)] : [];
}

/** The field's original text — non-inserted segments only (invariant). */
export function segmentsText(segments: CurationSegment[]): string {
  return segments.filter((s) => !s.inserted).map((s) => s.text).join('');
}

/** Fuse neighbouring token-less SOURCE segments of the same in-key state, so
 *  a later selection can span the seam. */
function mergeAdjacent(segments: CurationSegment[]): CurationSegment[] {
  const out: CurationSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (
      prev && !prev.token && !prev.inserted && prev.inKey === seg.inKey &&
      !seg.token && !seg.inserted
    ) {
      out[out.length - 1] = { ...prev, text: prev.text + seg.text };
    } else {
      out.push(seg);
    }
  }
  return out;
}

/**
 * Replace the [start, end) character range of a token-less SOURCE segment
 * (kept OR excluded — a pill over excluded text puts it back into the key)
 * with a pill covering exactly that text. The surrounding text keeps the
 * segment's original in-key state. Null when the target/range is invalid.
 */
export function replaceRangeWithPill(
  segments: CurationSegment[],
  index: number,
  start: number,
  end: number,
  pill: SegmentPill,
): CurationSegment[] | null {
  const seg = segments[index];
  if (!seg || seg.token || seg.inserted) return null;
  if (start < 0 || end > seg.text.length || start >= end) return null;
  const make = seg.inKey ? kept : excluded;
  const pieces: CurationSegment[] = [];
  const before = seg.text.slice(0, start);
  const after = seg.text.slice(end);
  if (before) pieces.push(make(before));
  pieces.push({ text: seg.text.slice(start, end), token: pill, inKey: true, inserted: false, glued: false });
  if (after) pieces.push(make(after));
  return mergeAdjacent(segments.slice(0, index).concat(pieces, segments.slice(index + 1)));
}

/** Swap the pill at `index` for another (same covered text / insertion). */
export function replacePillAt(
  segments: CurationSegment[],
  index: number,
  pill: SegmentPill,
): CurationSegment[] | null {
  const seg = segments[index];
  if (!seg || !seg.token) return null;
  const out = segments.slice();
  out[index] = { ...seg, token: pill };
  return out;
}

/** "Back to the exact words": a source-backed pill returns to kept words and
 *  fuses with its kept neighbours. Null for inserted pills (nothing to
 *  restore — delete them instead). */
export function restorePillToWords(segments: CurationSegment[], index: number): CurationSegment[] | null {
  const seg = segments[index];
  if (!seg || !seg.token || seg.inserted) return null;
  const out = segments.slice();
  out[index] = kept(seg.text);
  return mergeAdjacent(out);
}

/**
 * "Remove from the key" on a whole segment: a source-backed pill's covered
 * text becomes excluded; an inserted segment (words or pill) is deleted.
 * Null for kept/excluded text segments — use `excludeRange` for words.
 */
export function removeSegmentFromKey(segments: CurationSegment[], index: number): CurationSegment[] | null {
  const seg = segments[index];
  if (!seg) return null;
  if (seg.inserted) {
    return segments.slice(0, index).concat(segments.slice(index + 1));
  }
  if (!seg.token) return null;
  const out = segments.slice();
  out[index] = excluded(seg.text);
  return mergeAdjacent(out);
}

/** "Remove from the key" on a selection of kept words: the covered range
 *  becomes excluded text; the words around it stay kept. */
export function excludeRange(
  segments: CurationSegment[],
  index: number,
  start: number,
  end: number,
): CurationSegment[] | null {
  const seg = segments[index];
  if (!seg || seg.token || seg.inserted || !seg.inKey) return null;
  if (start < 0 || end > seg.text.length || start >= end) return null;
  const pieces: CurationSegment[] = [];
  const before = seg.text.slice(0, start);
  const after = seg.text.slice(end);
  if (before) pieces.push(kept(before));
  pieces.push(excluded(seg.text.slice(start, end)));
  if (after) pieces.push(kept(after));
  return mergeAdjacent(segments.slice(0, index).concat(pieces, segments.slice(index + 1)));
}

/** "Include in the key": an excluded segment returns to kept words. */
export function includeSegmentAt(segments: CurationSegment[], index: number): CurationSegment[] | null {
  const seg = segments[index];
  if (!seg || seg.token || seg.inserted || seg.inKey) return null;
  const out = segments.slice();
  out[index] = kept(seg.text);
  return mergeAdjacent(out);
}

/** Seed for a new inserted segment: typed words (`text`) or a pill. */
export type InsertedSeed = { text: string; token?: null; glued?: boolean } | { text?: ''; token: SegmentPill; glued?: boolean };

/** Insert an INSERTED segment at array position `index` (0..length). */
export function insertSegmentAt(
  segments: CurationSegment[],
  index: number,
  seed: InsertedSeed,
): CurationSegment[] | null {
  if (index < 0 || index > segments.length) return null;
  const token = seed.token ?? null;
  const text = token ? '' : (seed.text ?? '').trim();
  if (!token && !text) return null;
  const seg: CurationSegment = { text, token, inKey: true, inserted: true, glued: seed.glued ?? false };
  return segments.slice(0, index).concat([seg], segments.slice(index));
}

/**
 * Split a token-less SOURCE segment at `offset` so something can be inserted
 * relative to a selection inside it. Returns the (possibly new) array and the
 * boundary's array index. Offsets at (or beyond) the edges split nothing.
 */
export function splitSourceSegmentAt(
  segments: CurationSegment[],
  index: number,
  offset: number,
): { segments: CurationSegment[]; index: number } | null {
  const seg = segments[index];
  if (!seg || seg.token || seg.inserted) return null;
  if (offset <= 0) return { segments, index };
  if (offset >= seg.text.length) return { segments, index: index + 1 };
  const make = seg.inKey ? kept : excluded;
  return {
    segments: segments.slice(0, index).concat([make(seg.text.slice(0, offset)), make(seg.text.slice(offset))], segments.slice(index + 1)),
    index: index + 1,
  };
}

/** Toggle an inserted segment's "attach to previous (no space)" flag. */
export function setInsertedGlued(segments: CurationSegment[], index: number, glued: boolean): CurationSegment[] | null {
  const seg = segments[index];
  if (!seg || !seg.inserted) return null;
  const out = segments.slice();
  out[index] = { ...seg, glued };
  return out;
}

/**
 * Normalize a DOM-derived selection (two segment/offset pairs, any direction)
 * into a workable range: must fall inside ONE token-less SOURCE segment
 * (kept or excluded), shrunk to exclude leading/trailing whitespace. Null
 * when it can't be acted on (crosses a pill, empty, whitespace-only).
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
  if (!seg || seg.token || seg.inserted) return null;
  let start = Math.max(0, Math.min(aOff, bOff));
  let end = Math.min(seg.text.length, Math.max(aOff, bOff));
  while (start < end && /\s/.test(seg.text[start])) start++;
  while (end > start && /\s/.test(seg.text[end - 1])) end--;
  if (start >= end) return null;
  return { index: aSeg, start, end, text: seg.text.slice(start, end) };
}

/**
 * Derive the field's key tokens (UI_Curation_Studio_Editing.md §5):
 *
 *  1. Kept words → one trimmed Literal; a pill → its token — glued when NO
 *     whitespace separates it from the previous emitted token in the original
 *     text (a pill inside a word splits it).
 *  2. An EXCLUDED run counts as a whitespace gap, and — when it sits between
 *     two emitted tokens — emits one `<ANY>` placeholder (once per run, never
 *     glued). A run at the start/end of the field emits nothing: the key just
 *     begins later or ends earlier.
 *  3. INSERTED words → a Literal of the typed text; an inserted pill → its
 *     token — both take Glued from the segment's own flag, and whatever
 *     follows an insertion starts un-glued.
 */
export function segmentsToTokens(field: KeyTokenField, segments: CurationSegment[]): KeyToken[] {
  const out: KeyToken[] = [];
  // True while whitespace (or nothing-yet) separates the next source-backed
  // token from the previous emitted one.
  let gap = true;
  // A non-whitespace excluded run seen since the last emitted token.
  let pendingAny = false;

  const push = (tok: Omit<KeyToken, 'Field' | 'Glued'>, glued: boolean) => {
    if (pendingAny && out.length > 0) {
      out.push({ Field: field, Kind: 'Placeholder', Text: 'ANY', Glued: false });
      glued = false; // never glue across the gap the run left behind
    }
    pendingAny = false;
    out.push({
      Field: field,
      Kind: tok.Kind,
      Text: tok.Text,
      ...(tok.Item != null ? { Item: tok.Item } : {}),
      ...(tok.Length != null ? { Length: tok.Length } : {}),
      Glued: out.length > 0 && glued,
    });
  };

  for (const seg of segments) {
    if (seg.inserted) {
      if (seg.token) {
        push(seg.token, seg.glued);
      } else {
        const text = seg.text.trim();
        if (text) push({ Kind: 'Literal', Text: text }, seg.glued);
      }
      gap = true; // a source-backed follower never glues to an insertion
    } else if (!seg.inKey) {
      if (seg.text.trim()) pendingAny = true;
      gap = true; // the run reads as a gap even when it was glued in source
    } else if (seg.token) {
      push(seg.token, !gap);
      gap = false;
    } else {
      if (/^\s/.test(seg.text)) gap = true;
      const trimmed = seg.text.trim();
      if (trimmed) {
        push({ Kind: 'Literal', Text: trimmed }, !gap);
        gap = /\s$/.test(seg.text);
      } else if (seg.text.length > 0) {
        gap = true;
      }
    }
  }
  // A trailing pendingAny is discarded: the key simply ends earlier.
  return out;
}

/** True when the operator has shaped this field at all (pill, exclusion, or
 *  insertion). */
export function segmentsHavePills(segments: CurationSegment[]): boolean {
  return segments.some((s) => s.token !== null || s.inserted || !s.inKey);
}
