import type { KeyToken, KeyTokenField } from '../api/sampling';

/**
 * Matching-key token helpers (Curated View, backend 2026-09-07).
 *
 * A matching key is the narrative with the changing parts replaced by typed
 * placeholders, delivered as `KeyTokens[]` (never parse the anchor string).
 * Nine built-in placeholders exist; anything else is a LOV list tag
 * (`<BANKS>`, `<CARD_TYPES:Visa>`). `<NUM>` is a legacy synonym of `<INT>`.
 * Contract: UI_CuratedView_MatchingKeys.md §1 + §4.1.
 */

export const KEY_FIELD_LABELS: Record<KeyTokenField, string> = {
  AI: 'Additional Information',
  D2: 'Description 2',
  // Fallback fields (2026-09-08): rows with empty AI and D2 key on the
  // MT940 :61:/:86: narrative instead (e.g. TD=>NTRF, D1=>NONREF).
  D1: 'Description 1',
  TD: 'Transaction details',
};

/** Field order used when scanning a key's fields (primary fields first). */
export const KEY_FIELDS: readonly KeyTokenField[] = ['AI', 'D2', 'D1', 'TD'];

/** The built-in placeholders (plus the legacy NUM synonym for INT).
 *  IBAN split 2026-09-08: <IBAN> narrowed to foreign IBANs; the two Saudi
 *  placeholders separate intra-bank from outgoing transfers (Saudi IBAN
 *  chars 5-6 are the bank, compared against the row's own IBAN). */
const BUILTIN_PHRASES: Record<string, string> = {
  IBAN: 'a foreign IBAN',
  SA_IBAN_INTRA: "the bank's own IBAN",
  SA_IBAN: "another Saudi bank's IBAN",
  DATE: 'a date',
  TIME: 'a time',
  CURRENCY: 'a currency',
  DECIMAL: 'an amount',
  INT: 'a number',
  NUM: 'a number', // renamed to INT 2026-09-07; old anchors may still carry it
  AR: 'Arabic text',
  NAME: 'a name',
  STRING: 'any text',
  // Curation Studio (2026-09-08): fixed-width shape; carries Length.
  CHAR: 'characters',
  // Curation Studio editing delta (2026-09-08): what a removal in the MIDDLE
  // of a key leaves behind — "REFERENCE, then whatever, then FM".
  ANY: 'anything',
};

export function isBuiltinPlaceholder(text: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_PHRASES, text);
}

/** Naive singular of an UPPER_SNAKE list tag word ("BILLERS" → "biller",
 *  "COUNTRIES" → "country"). Good enough for labels, never sent anywhere. */
function singularizeWord(word: string): string {
  if (/ies$/i.test(word)) return word.slice(0, -3) + 'y';
  if (/[^s]s$/i.test(word)) return word.slice(0, -1);
  return word;
}

/** Plain-language phrase for a list tag: "BANKS" → "a bank",
 *  "SADAD_BILLERS" → "a sadad biller". */
export function listTagPhrase(listTag: string): string {
  const words = listTag.toLowerCase().split('_').filter(Boolean);
  if (words.length === 0) return 'a list value';
  words[words.length - 1] = singularizeWord(words[words.length - 1]);
  const phrase = words.join(' ');
  return `${/^[aeiou]/.test(phrase) ? 'an' : 'a'} ${phrase}`;
}

/**
 * Short non-technical phrase for one token: literals verbatim, built-in
 * placeholders and list tags as "a bank" / "a date" / "any text"; Keep-item
 * lists show the item itself ("Visa").
 */
export function tokenPhrase(token: KeyToken): string {
  if (token.Kind === 'Literal') return token.Text;
  if (token.Kind === 'List') {
    return token.Item ? token.Item.replace(/_/g, ' ') : listTagPhrase(token.Text);
  }
  if (token.Text === 'CHAR' && token.Length != null) {
    return `exactly ${token.Length} characters`;
  }
  return BUILTIN_PHRASES[token.Text] ?? token.Text.toLowerCase();
}

/** Chip text in the token grammar: literals verbatim, `<BANKS>`,
 *  `<CARD_TYPES:Visa>`, `<AR>` — the way the operator brief renders keys. */
export function tokenCode(token: KeyToken): string {
  if (token.Kind === 'Literal') return token.Text;
  if (token.Kind === 'List' && token.Item) return `<${token.Text}:${token.Item}>`;
  if (token.Kind === 'Placeholder' && token.Text === 'CHAR' && token.Length != null) {
    return `<CHAR[${token.Length}]>`;
  }
  return `<${token.Text}>`;
}

/** Chip color classes per token kind/type (hand-off §4.2 palette). */
export function tokenChipClass(token: KeyToken): string {
  if (token.Kind === 'Literal') {
    return 'border-border bg-surface text-heading';
  }
  if (token.Kind === 'List') {
    return 'border-teal-300 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800';
  }
  switch (token.Text) {
    case 'IBAN':
    case 'SA_IBAN':
    case 'SA_IBAN_INTRA':
      return 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800';
    case 'DATE':
    case 'TIME':
      return 'border-violet-300 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800';
    case 'CURRENCY':
    case 'DECIMAL':
    case 'INT':
    case 'NUM':
      return 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
    case 'AR':
      return 'border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
    case 'NAME':
      return 'border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800';
    case 'STRING':
    case 'CHAR':
    case 'ANY':
      return 'border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
    default:
      return 'border-border bg-surface-secondary text-body-secondary';
  }
}

const LABEL_MAX_LEN = 70;

function truncate(text: string): string {
  return text.length > LABEL_MAX_LEN ? `${text.slice(0, LABEL_MAX_LEN - 1).trimEnd()}…` : text;
}

/**
 * Non-technical group label from KeyTokens (hand-off §4.1): literals as
 * words, placeholders as short phrases. "Starts with …" when the first token
 * is a literal, "Transactions like …" otherwise. When the key spans both
 * fields, each field's segment is prefixed by its short name. Returns null
 * for an empty token list (the caller falls back to the anchor string).
 */
export function humanizeKeyTokens(tokens: KeyToken[] | null | undefined): string | null {
  if (!tokens || tokens.length === 0) return null;
  const fields: KeyTokenField[] = [];
  const byField = new Map<KeyTokenField, KeyToken[]>();
  for (const t of tokens) {
    let arr = byField.get(t.Field);
    if (!arr) {
      arr = [];
      byField.set(t.Field, arr);
      fields.push(t.Field);
    }
    arr.push(t);
  }
  const segments = fields.map((f) => {
    const parts = byField.get(f) ?? [];
    let text = '';
    for (const t of parts) {
      const phrase = tokenPhrase(t);
      if (text.length === 0) text = phrase;
      else text += (t.Glued ? '' : ' ') + phrase;
    }
    return { field: f, text };
  });
  const body =
    segments.length > 1
      ? segments.map((s) => `${s.field}: ${s.text}`).join(' · ')
      : segments[0].text;
  if (!body.trim()) return null;
  const startsWithLiteral = tokens[0].Kind === 'Literal';
  return startsWithLiteral ? `Starts with "${truncate(body)}"` : `Transactions like "${truncate(body)}"`;
}

// --- Editing operations -------------------------------------------------------
// The editor owns a working copy of the tokens; each operation returns a new
// array (never mutates). Glue discipline: replacing keeps the old chip's
// Glued; removing un-glues the follower so it doesn't fuse to the wrong chip.

export function replaceTokenAt(tokens: KeyToken[], index: number, next: Omit<KeyToken, 'Field' | 'Glued'>): KeyToken[] {
  const old = tokens[index];
  if (!old) return tokens;
  const out = tokens.slice();
  out[index] = { ...next, Field: old.Field, Glued: old.Glued ?? false };
  return out;
}

export function removeTokenAt(tokens: KeyToken[], index: number): KeyToken[] {
  if (index < 0 || index >= tokens.length) return tokens;
  const out = tokens.slice(0, index).concat(tokens.slice(index + 1));
  const follower = out[index];
  if (follower && follower.Glued && follower.Field === tokens[index].Field) {
    out[index] = { ...follower, Glued: false };
  }
  return out;
}

/**
 * Split a Literal token around the [start, end) character range of its Text,
 * replacing the covered words by `replacement` (a placeholder/list token).
 * Used by "mark a selection in an example": FAVOR BANK OF AMERICA N A with
 * "BANK OF AMERICA N A" selected becomes Literal "FAVOR" + the placeholder.
 * Returns null when the range is out of bounds or empty.
 */
export function splitLiteralToken(
  tokens: KeyToken[],
  index: number,
  start: number,
  end: number,
  replacement: Omit<KeyToken, 'Field' | 'Glued'>,
): KeyToken[] | null {
  const tok = tokens[index];
  if (!tok || tok.Kind !== 'Literal') return null;
  if (start < 0 || end > tok.Text.length || start >= end) return null;
  const before = tok.Text.slice(0, start).trim();
  const after = tok.Text.slice(end).trim();
  const pieces: KeyToken[] = [];
  if (before) pieces.push({ Field: tok.Field, Kind: 'Literal', Text: before, Glued: tok.Glued ?? false });
  pieces.push({
    ...replacement,
    Field: tok.Field,
    // Glued only when nothing was kept before it AND the original was glued.
    Glued: before ? false : (tok.Glued ?? false),
  });
  if (after) pieces.push({ Field: tok.Field, Kind: 'Literal', Text: after, Glued: false });
  return tokens.slice(0, index).concat(pieces, tokens.slice(index + 1));
}

/**
 * Find selected words inside the key's Literal tokens of any field:
 * returns the token index + character range, or null when the words are not
 * part of any single literal chip (keys cannot grow beyond the engine's key
 * except by appending — hand-off §4.2). Case-insensitive, whitespace-tolerant.
 */
export function locateSelectionInTokens(
  tokens: KeyToken[],
  selection: string,
): { index: number; start: number; end: number } | null {
  const needle = selection.trim().replace(/\s+/g, ' ');
  if (!needle) return null;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.Kind !== 'Literal') continue;
    const hay = tok.Text;
    // Try a direct (case-insensitive) find first, then a space-run-tolerant scan.
    const direct = hay.toLowerCase().indexOf(needle.toLowerCase());
    if (direct >= 0) return { index: i, start: direct, end: direct + needle.length };
    const pattern = needle
      .split(' ')
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');
    const m = new RegExp(pattern, 'i').exec(hay);
    if (m) return { index: i, start: m.index, end: m.index + m[0].length };
  }
  return null;
}

/**
 * Client-side mirror of the backend's "key pins nothing" validation: a key
 * must keep at least one literal with 3+ meaningful (alphanumeric) characters
 * or one list value. Used to disable Apply before the server says so.
 * Arabic block via escapes — no literal RTL chars in source (gotcha #30).
 */
export function tokensPinSomething(tokens: KeyToken[]): boolean {
  const meaningful = new RegExp('[A-Za-z0-9\\u0600-\\u06FF]', 'g');
  return tokens.some(
    (t) =>
      t.Kind === 'List' ||
      (t.Kind === 'Literal' && (t.Text.match(meaningful)?.length ?? 0) >= 3),
  );
}

/**
 * Best-effort alignment of one field's tokens against an example text, so
 * "Keep the exact words" can show the words a placeholder actually stands
 * for. Literals match loosely (case-insensitive, space-run-tolerant),
 * placeholders capture lazily (the last one greedily). Returns the matched
 * text per token index, or null when the example doesn't fit the key — or
 * when two placeholders sit side by side (the split between them is
 * ambiguous; showing confidently-wrong words would be worse than asking, so
 * the caller falls back to letting the operator type/select them).
 */
export function alignTokensToExample(
  tokens: KeyToken[],
  field: KeyTokenField,
  example: string,
): Map<number, string> | null {
  const fieldTokens = tokens
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.Field === field);
  if (fieldTokens.length === 0) return null;
  for (let p = 1; p < fieldTokens.length; p++) {
    if (fieldTokens[p - 1].t.Kind !== 'Literal' && fieldTokens[p].t.Kind !== 'Literal') return null;
  }
  let pattern = '^\\s*';
  const groupToIndex: number[] = [];
  fieldTokens.forEach(({ t, i }, pos) => {
    if (pos > 0) pattern += t.Glued ? '' : '\\s+';
    if (t.Kind === 'Literal') {
      pattern += t.Text.trim()
        .split(/\s+/)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+');
    } else {
      const last = pos === fieldTokens.length - 1;
      pattern += last ? '(.+)' : '(.+?)';
      groupToIndex.push(i);
    }
  });
  let m: RegExpExecArray | null;
  try {
    m = new RegExp(pattern, 'i').exec(example);
  } catch {
    return null;
  }
  if (!m) return null;
  const out = new Map<number, string>();
  groupToIndex.forEach((tokenIndex, g) => {
    const text = (m![g + 1] ?? '').trim();
    if (text) out.set(tokenIndex, text);
  });
  return out;
}

/** Deep-enough equality for "has the operator changed anything yet". */
export function tokensEqual(a: KeyToken[], b: KeyToken[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((t, i) => {
    const u = b[i];
    return (
      t.Field === u.Field &&
      t.Kind === u.Kind &&
      t.Text === u.Text &&
      (t.Item ?? null) === (u.Item ?? null) &&
      (t.Length ?? null) === (u.Length ?? null) &&
      (t.Glued ?? false) === (u.Glued ?? false)
    );
  });
}
