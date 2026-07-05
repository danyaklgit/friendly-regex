import type { MatchOperation, ExtractionOperation } from '../types';

/**
 * Returns true when the input contains active regex syntax (quantifiers,
 * groups, classes, alternation, anchors). Conservative — `.` and `\` count
 * even though they're sometimes typed as literals, because the boundary
 * fields can contain real regex (e.g. `(?:/|$)`).
 */
function looksLikeRegex(text: string): boolean {
  if (/\\[dDwWsSbBntrfv0]/.test(text)) return true; // shorthand classes
  if (/\\\\/.test(text)) return true; // escaped backslash → clearly regex
  const stripped = text.replace(/\\./g, '');
  // eslint-disable-next-line no-useless-escape
  return /[.*+?^${}()|[\]]/.test(stripped);
}

// ── Regex narrator ────────────────────────────────────────────────────────
// A small recursive-descent narrator that walks a regex pattern, splits it into
// atoms (anchors, literals, character classes, shorthands, groups, lookarounds),
// and produces a plain-English description. Unsupported constructs degrade to
// showing the raw pattern fragment.

type Atom =
  | { kind: 'anchor'; which: '^' | '$' }
  | { kind: 'literal'; text: string }
  | { kind: 'shorthand'; cls: 'd' | 'D' | 'w' | 'W' | 's' | 'S' | '.'; quantifier?: string }
  | { kind: 'charclass'; raw: string; quantifier?: string }
  | { kind: 'lookaround'; direction: 'before' | 'after'; positive: boolean; inner: string }
  | { kind: 'group'; capturing: boolean; inner: string; quantifier?: string };

function findMatchingClose(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function readQuantifier(s: string, i: number): { q?: string; advance: number } {
  const m = s.slice(i).match(/^(\{\d+(?:,\d*)?\}\??|[*+?]\??)/);
  return m ? { q: m[1], advance: m[1].length } : { advance: 0 };
}

function tokenize(pattern: string): Atom[] {
  const out: Atom[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ kind: 'literal', text: buf }); buf = ''; } };
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '\\') {
      const next = pattern[i + 1];
      if (next && /[dDwWsS]/.test(next)) {
        flush();
        const q = readQuantifier(pattern, i + 2);
        out.push({ kind: 'shorthand', cls: next as Atom & { kind: 'shorthand' } extends infer T ? (T extends { cls: infer C } ? C : never) : never, quantifier: q.q });
        i += 2 + q.advance;
        continue;
      }
      // Escaped literal
      if (next !== undefined) { buf += next; i += 2; continue; }
      buf += ch; i++; continue;
    }
    if (ch === '.') {
      flush();
      const q = readQuantifier(pattern, i + 1);
      out.push({ kind: 'shorthand', cls: '.', quantifier: q.q });
      i += 1 + q.advance;
      continue;
    }
    if (ch === '^' || ch === '$') {
      flush();
      out.push({ kind: 'anchor', which: ch });
      i++; continue;
    }
    if (ch === '[') {
      flush();
      let j = i + 1;
      while (j < pattern.length && pattern[j] !== ']') {
        if (pattern[j] === '\\') j++;
        j++;
      }
      const raw = pattern.slice(i, j + 1);
      i = j + 1;
      const q = readQuantifier(pattern, i);
      out.push({ kind: 'charclass', raw, quantifier: q.q });
      i += q.advance;
      continue;
    }
    if (ch === '(') {
      flush();
      const close = findMatchingClose(pattern, i);
      if (close === -1) { buf += pattern.slice(i); break; }
      const head4 = pattern.slice(i + 1, i + 4);
      const head3 = pattern.slice(i + 1, i + 3);
      let kind: 'lookaround' | 'group';
      let direction: 'before' | 'after' = 'after';
      let positive = true;
      let capturing = true;
      let innerStart = i + 1;
      if (head4 === '?<=') { kind = 'lookaround'; direction = 'before'; positive = true; innerStart = i + 4; }
      else if (head4 === '?<!') { kind = 'lookaround'; direction = 'before'; positive = false; innerStart = i + 4; }
      else if (head3 === '?=') { kind = 'lookaround'; direction = 'after'; positive = true; innerStart = i + 3; }
      else if (head3 === '?!') { kind = 'lookaround'; direction = 'after'; positive = false; innerStart = i + 3; }
      else if (head3 === '?:') { kind = 'group'; capturing = false; innerStart = i + 3; }
      else { kind = 'group'; capturing = true; innerStart = i + 1; }
      const inner = pattern.slice(innerStart, close);
      i = close + 1;
      const q = readQuantifier(pattern, i);
      i += q.advance;
      if (kind === 'lookaround') out.push({ kind, direction, positive, inner });
      else out.push({ kind: 'group', capturing, inner, quantifier: q.q });
      continue;
    }
    buf += ch; i++;
  }
  flush();
  return out;
}

function splitTopLevelAlternation(pattern: string): string[] {
  const parts: string[] = [];
  let depth = 0, classDepth = 0;
  let current = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') { current += ch + (pattern[i + 1] ?? ''); i++; continue; }
    if (classDepth === 0 && ch === '(') depth++;
    else if (classDepth === 0 && ch === ')') depth--;
    if (depth === 0 && ch === '[') classDepth++;
    else if (classDepth > 0 && ch === ']') classDepth--;
    if (ch === '|' && depth === 0 && classDepth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function nounForShorthand(cls: string): string {
  switch (cls) {
    case 'd': return 'digit';
    case 'D': return 'non-digit';
    case 'w': return 'word character';
    case 'W': return 'non-word character';
    case 's': return 'whitespace character';
    case 'S': return 'non-whitespace character';
    case '.': return 'character';
    default: return cls;
  }
}

function nounForCharClass(raw: string): { noun: string; generic: false } | { phrase: string; generic: true } {
  const m = raw.match(/^\[(\^?)(.*)\]$/);
  if (!m) return { phrase: raw, generic: true };
  const negated = m[1] === '^';
  const inner = m[2];

  // Common pre-named classes
  const map: Record<string, [string, string]> = {
    'A-Z': ['uppercase letter', 'non-uppercase letter'],
    'a-z': ['lowercase letter', 'non-lowercase letter'],
    'A-Za-z': ['letter', 'non-letter'],
    'a-zA-Z': ['letter', 'non-letter'],
    '0-9': ['digit', 'non-digit'],
    'A-Za-z0-9': ['alphanumeric character', 'non-alphanumeric character'],
    'a-zA-Z0-9': ['alphanumeric character', 'non-alphanumeric character'],
    '0-9A-Za-z': ['alphanumeric character', 'non-alphanumeric character'],
  };
  const known = map[inner];
  if (known) return { noun: negated ? known[1] : known[0], generic: false };

  // Single range like [0-3] or [a-f]: pick a friendly noun head based on endpoint type.
  const rangeMatch = inner.match(/^(.)-(.)$/);
  if (rangeMatch) {
    const a = rangeMatch[1], b = rangeMatch[2];
    let head = 'character';
    if (/[0-9]/.test(a) && /[0-9]/.test(b)) head = 'digit';
    else if (/[a-z]/.test(a) && /[a-z]/.test(b)) head = 'lowercase letter';
    else if (/[A-Z]/.test(a) && /[A-Z]/.test(b)) head = 'uppercase letter';
    const modifier = `from ${a} to ${b}`;
    if (negated) return { noun: `non-${head} (outside ${modifier})`, generic: false };
    return { noun: `${head} ${modifier}`, generic: false };
  }

  // Literal-list like [01] or [abc]: render as "X or Y" (or "X, Y, or Z").
  // Restrict to printable ASCII without metacharacters to avoid surprises.
  if (/^[A-Za-z0-9 _!@#%&,;:'"/]+$/.test(inner) && inner.length >= 1) {
    const chars = [...inner];
    const quoted = chars.map((c) => `"${c}"`);
    let phrase: string;
    if (quoted.length === 1) phrase = quoted[0];
    else if (quoted.length === 2) phrase = quoted.join(' or ');
    else phrase = quoted.slice(0, -1).join(', ') + ', or ' + quoted[quoted.length - 1];
    return {
      phrase: negated ? `any character that isn't ${phrase}` : phrase,
      generic: true,
    };
  }

  return {
    phrase: negated ? `any character not in [${inner}]` : `any character in [${inner}]`,
    generic: true,
  };
}

/**
 * Pluralize a noun phrase by pluralizing its head word. For known head nouns
 * (letter, character, digit, etc.) we pluralize at the head so modifiers like
 * "from 0 to 3" stay in place. Otherwise append 's' to the last word.
 */
function pluralize(noun: string): string {
  const words = noun.split(' ');
  const HEADS = /^(letters?|characters?|digits?|positions?|occurrences?|matches)$/;
  for (let i = words.length - 1; i >= 0; i--) {
    if (HEADS.test(words[i])) {
      if (!words[i].endsWith('s')) words[i] = words[i] + 's';
      return words.join(' ');
    }
  }
  words[words.length - 1] = words[words.length - 1] + 's';
  return words.join(' ');
}

function formatQuantifiedNoun(noun: string, q: string | undefined): string {
  if (!q) return `a ${noun}`;
  const lazy = q.endsWith('?') && q.length > 1 && q !== '??' && q !== '?';
  // Strip trailing ? for lazy quantifier (rendering is the same, lazy is implementation detail)
  const base = lazy ? q.slice(0, -1) : q;
  if (base === '*') return `zero or more ${pluralize(noun)}`;
  if (base === '+') return `one or more ${pluralize(noun)}`;
  if (base === '?' || q === '??') return `an optional ${noun}`;
  const m = base.match(/^\{(\d+)(?:,(\d*))?\}$/);
  if (m) {
    const a = m[1], b = m[2];
    if (b === undefined) return +a === 1 ? `a ${noun}` : `${a} ${pluralize(noun)}`;
    if (b === '') return `${a} or more ${pluralize(noun)}`;
    return `${a} to ${b} ${pluralize(noun)}`;
  }
  return `${noun} (${q})`;
}

function formatQuantifiedPhrase(phrase: string, q: string | undefined): string {
  if (!q) return phrase;
  const lazy = q.endsWith('?') && q.length > 1 && q !== '??';
  const base = lazy ? q.slice(0, -1) : q;
  if (base === '*') return `zero or more occurrences of ${phrase}`;
  if (base === '+') return `one or more occurrences of ${phrase}`;
  if (base === '?') return `an optional ${phrase}`;
  const m = base.match(/^\{(\d+)(?:,(\d*))?\}$/);
  if (m) {
    const a = m[1], b = m[2];
    if (b === undefined) return +a === 1 ? phrase : `${a} occurrences of ${phrase}`;
    if (b === '') return `${a} or more occurrences of ${phrase}`;
    return `${a} to ${b} occurrences of ${phrase}`;
  }
  return `${phrase} (${q})`;
}

function describeAtom(atom: Atom): string {
  switch (atom.kind) {
    case 'anchor': return atom.which === '^' ? 'start of input' : 'end of input';
    case 'literal': return `"${atom.text}"`;
    case 'shorthand': return formatQuantifiedNoun(nounForShorthand(atom.cls), atom.quantifier);
    case 'charclass': {
      const cls = nounForCharClass(atom.raw);
      return cls.generic
        ? formatQuantifiedPhrase(cls.phrase, atom.quantifier)
        : formatQuantifiedNoun(cls.noun, atom.quantifier);
    }
    case 'lookaround': {
      const inner = narratePattern(atom.inner);
      const conj = atom.direction === 'before'
        ? (atom.positive ? 'preceded by' : 'not preceded by')
        : (atom.positive ? 'followed by' : 'not followed by');
      return `${conj} ${inner}`;
    }
    case 'group': {
      const inner = narratePattern(atom.inner);
      // A group without a quantifier adds no narrative value — narrate its
      // contents directly. The role-specific tail sentence ("The matched
      // text is extracted." / "Extraction starts after this match.") tells
      // the user what's captured; redundant parens just create visual noise.
      if (!atom.quantifier) return inner;
      return formatQuantifiedPhrase(`(${inner})`, atom.quantifier);
    }
  }
}

function narrateAtoms(atoms: Atom[]): string {
  // Pull lookarounds out as constraint clauses; render the rest as a sequence.
  const main: Atom[] = [];
  const constraints: string[] = [];
  for (const a of atoms) {
    if (a.kind === 'lookaround') constraints.push(describeAtom(a));
    else main.push(a);
  }
  const core = main.length === 0 ? '' : main.map(describeAtom).join(', then ');
  if (constraints.length === 0) return core;
  const constraintStr = constraints.join(', and ');
  return core ? `${core} (${constraintStr})` : `a position ${constraintStr}`;
}

/**
 * Plain-English narration of an arbitrary regex pattern. Walks the pattern
 * structurally so long, composite patterns get a real explanation rather
 * than a "Regex pattern: ..." fallback.
 */
export function narratePattern(pattern: string): string {
  if (!pattern) return '';
  const branches = splitTopLevelAlternation(pattern);
  if (branches.length > 1) return branches.map(narratePattern).join(' or ');
  const atoms = tokenize(pattern);
  return narrateAtoms(atoms);
}

/**
 * Plain-English description of how an extraction field's value will be
 * matched, paired with a sentence about its role in the extraction. Handles
 * literal text and regex content for three field roles:
 *
 *   prefix  — marks the start of extraction; extracted text begins after it
 *   suffix  — marks the end of extraction; extracted text ends before it
 *   pattern — for `extract_matching`, the matched text is itself extracted
 *
 * Examples:
 *   "/ORDP/" as prefix → 'Looks for the literal text "/ORDP/". Extraction starts after this text.'
 *   "(?:/|$)" as suffix → 'Looks for "/" or end of input. Extraction stops before this match.'
 *   "\d{2}" as pattern → 'Matches exactly 2 digits. The matched text is extracted.'
 */
export function describeLiteralBoundary(
  text: string,
  role: 'prefix' | 'suffix' | 'pattern' = 'prefix',
): string {
  if (text.length === 0) {
    if (role === 'prefix') return 'Empty — extraction starts at the beginning of the source field.';
    if (role === 'suffix') return 'Empty — extraction continues to the end of the source field.';
    return 'Empty — no pattern set.';
  }

  if (role === 'pattern') {
    if (!looksLikeRegex(text)) {
      return `Looks for the literal text "${text}". The matched text is extracted.`;
    }
    return `Matches ${narratePattern(text)}. The matched text is extracted.`;
  }

  const tail = role === 'prefix' ? 'Extraction starts after this' : 'Extraction stops before this';

  if (!looksLikeRegex(text)) {
    return `Looks for the literal text "${text}". ${tail} text.`;
  }
  return `Looks for ${narratePattern(text)}. ${tail} match.`;
}

function unescapeRegex(str: string): string {
  // Unescape backslash sequences EXCEPT regex shorthand classes (\d, \w, \s, \b, \n, \t, \r, etc.)
  // This correctly handles escaped spaces (\ ) and escaped literals (\., \*, etc.)
  // while preserving meaningful regex sequences like \d{2}
  return str.replace(/\\([^dDwWsSbBntrfv0])/g, '$1');
}

function hasActiveRegexSyntax(str: string): boolean {
  // Escaped backslash (\\) means the regex matches a literal backslash — clearly complex/imported
  if (/\\\\/.test(str)) return true;
  // Strip all \X escape sequences, then check for remaining metacharacters
  const withoutEscapes = str.replace(/\\./g, '');
  // eslint-disable-next-line no-useless-escape
  return /[.*+?{}()\[\]|]/.test(withoutEscapes);
}

/**
 * Converts a regex string to a human-readable description.
 * ^TNXT/56         → "Begins with 'TNXT/56'"
 * USD$             → "Ends with 'USD'"
 * ^EXACT$          → "Equals 'EXACT'"
 * ^(?!.*VOID)      → "Does not contain 'VOID'"
 * ^(?!BAD$)        → "Does not equal 'BAD'"
 * PAYMENT          → "Contains 'PAYMENT'"
 * /ORDP/(.*?)/     → "Extract between '/ORDP/' and '/'"
 */
export function engregxify(regex: string): string {
  // Numeric comparisons
  if (regex.startsWith('__NUMERIC_GT:')) return `Greater than '${regex.slice('__NUMERIC_GT:'.length)}'`;
  if (regex.startsWith('__NUMERIC_LT:')) return `Less than '${regex.slice('__NUMERIC_LT:'.length)}'`;
  if (regex.startsWith('__NUMERIC_GTE:')) return `Greater than or equal to '${regex.slice('__NUMERIC_GTE:'.length)}'`;
  if (regex.startsWith('__NUMERIC_LTE:')) return `Less than or equal to '${regex.slice('__NUMERIC_LTE:'.length)}'`;

  // Nullary operations — regex shapes emitted by regexify() for
  // is_blank_or_empty / is_not_blank_or_empty. The "blank" shape matches
  // empty, whitespace-only, and dash-only values; the "not blank" shape
  // matches anything with at least one non-whitespace, non-dash character.
  // Checked before the lookahead patterns since these are anchored, no-
  // value forms.
  if (regex === '^[\\s-]*$') return 'Is blank or empty';
  if (regex === '^.*[^\\s-].*$') return 'Is not blank or empty';
  // Legacy shapes the frontend briefly emitted (sentinel form + pure
  // whitespace regex). Saved TagSpec libraries from those releases still
  // need to surface the friendly label.
  if (regex === '__IS_BLANK_OR_EMPTY:' || regex === '__IS_BLANK_OR_EMPTY') return 'Is blank or empty';
  if (regex === '__IS_NOT_BLANK_OR_EMPTY:' || regex === '__IS_NOT_BLANK_OR_EMPTY') return 'Is not blank or empty';
  if (regex === '^\\s*$') return 'Is blank or empty';
  if (regex === '^\\s*\\S[\\s\\S]*$') return 'Is not blank or empty';

  // Negative lookbehind: does not end with — (?<!value)$ (legacy form)
  const doesNotEndWithMatch = regex.match(/^\(\?<!(.+)\)\$$/);
  if (doesNotEndWithMatch) {
    if (!hasActiveRegexSyntax(doesNotEndWithMatch[1])) {
      return `Does not end with '${unescapeRegex(doesNotEndWithMatch[1])}'`;
    }
  }

  // Negative lookahead: does not end with — `^(?!.*value$).*$` (current
  // frontend form via regexify). Checked BEFORE does_not_contain so the
  // anchored `$` inside the lookahead isn't swallowed by the more permissive
  // does_not_contain pattern.
  const doesNotEndWithLAMatch = regex.match(/^\^\(\?!\.\*(.+)\$\)(?:\.\*\$)?$/);
  if (doesNotEndWithLAMatch) {
    if (!hasActiveRegexSyntax(doesNotEndWithLAMatch[1])) {
      return `Does not end with '${unescapeRegex(doesNotEndWithLAMatch[1])}'`;
    }
  }

  // Negative lookahead: does not contain — `^(?!.*value)` and the optional
  // trailing `.*$` that regexify emits.
  const doesNotContainMatch = regex.match(/^\^\(\?!\.\*(.+)\)(?:\.\*\$)?$/);
  if (doesNotContainMatch) {
    if (!hasActiveRegexSyntax(doesNotContainMatch[1])) {
      return `Does not contain '${unescapeRegex(doesNotContainMatch[1])}'`;
    }
  }

  // Negative lookahead: does not contain — `^((?!value).)*$` (alternate
  // backend form, semantically identical).
  const doesNotContainAltMatch = regex.match(/^\^\(\(\?!(.+)\)\.\)\*\$$/);
  if (doesNotContainAltMatch) {
    if (!hasActiveRegexSyntax(doesNotContainAltMatch[1])) {
      return `Does not contain '${unescapeRegex(doesNotContainAltMatch[1])}'`;
    }
  }

  // Negative lookahead: does not equal — ^(?!value$) with optional `.*$` tail
  const doesNotEqualMatch = regex.match(/^\^\(\?!(.+)\$\)(?:\.\*\$)?$/);
  if (doesNotEqualMatch) {
    if (!hasActiveRegexSyntax(doesNotEqualMatch[1])) {
      return `Does not equal '${unescapeRegex(doesNotEqualMatch[1])}'`;
    }
  }

  // Negative lookahead: does not start with — ^(?!value) with optional `.*$` tail
  const doesNotStartWithMatch = regex.match(/^\^\(\?!(.+)\)(?:\.\*\$)?$/);
  if (doesNotStartWithMatch) {
    if (!hasActiveRegexSyntax(doesNotStartWithMatch[1])) {
      return `Does not start with '${unescapeRegex(doesNotStartWithMatch[1])}'`;
    }
  }

  // Extract between: prefix(.*?)suffix
  const extractBetweenMatch = regex.match(/^(.+?)\(\.\*\?\)(.+)$/);
  if (extractBetweenMatch) {
    return `Extract between '${unescapeRegex(extractBetweenMatch[1])}' and '${unescapeRegex(extractBetweenMatch[2])}'`;
  }

  // Extract after: prefix(.*)
  const extractAfterMatch = regex.match(/^(.+)\(\.\*\)$/);
  if (extractAfterMatch) {
    return `Extract after '${unescapeRegex(extractAfterMatch[1])}'`;
  }

  // Extract before: (.*?)suffix
  const extractBeforeMatch = regex.match(/^\(\.\*\?\)(.+)$/);
  if (extractBeforeMatch) {
    return `Extract before '${unescapeRegex(extractBeforeMatch[1])}'`;
  }

  // Equals: ^value$ — also accepts the ISO-date-tolerant `(T|$)` end anchor.
  const equalsMatch = regex.match(/^\^(.+?)(?:\$|\(T\|\$\))$/);
  if (equalsMatch) {
    if (!hasActiveRegexSyntax(equalsMatch[1])) {
      return `Equals '${unescapeRegex(equalsMatch[1])}'`;
    }
  }

  // Begins with: ^value
  const beginsWithMatch = regex.match(/^\^(.+)$/);
  if (beginsWithMatch) {
    if (!hasActiveRegexSyntax(beginsWithMatch[1])) {
      return `Starts with '${unescapeRegex(beginsWithMatch[1])}'`;
    }
  }

  // Ends with: value$ — same date tolerance.
  const endsWithMatch = regex.match(/^(.+?)(?:\$|\(T\|\$\))$/);
  if (endsWithMatch) {
    if (!hasActiveRegexSyntax(endsWithMatch[1])) {
      return `Ends with '${unescapeRegex(endsWithMatch[1])}'`;
    }
  }

  // Matches pattern (contains |)
  if (regex.includes('|') && !hasActiveRegexSyntax(regex)) {
    const parts = regex.split('|').map(unescapeRegex);
    return `Matches one of: ${parts.map(p => `'${p}'`).join(', ')}`;
  }

  // Complex regex with active syntax
  if (hasActiveRegexSyntax(regex)) {
    return `Matches pattern '${regex}'`;
  }

  // Default: contains (simple literal text)
  return `Contains '${unescapeRegex(regex)}'`;
}

/**
 * Decomposes a regex string into a structured operation + value.
 * Used to populate the wizard when editing existing rules.
 */
export function decomposeRegex(regex: string): {
  operation: MatchOperation;
  value: string;
  values?: string[];
  prefix?: string;
  suffix?: string;
} {
  // Numeric comparisons
  const numericOps: { prefix: string; operation: MatchOperation }[] = [
    { prefix: '__NUMERIC_GT:', operation: 'greater_than' },
    { prefix: '__NUMERIC_LT:', operation: 'less_than' },
    { prefix: '__NUMERIC_GTE:', operation: 'greater_than_or_equal' },
    { prefix: '__NUMERIC_LTE:', operation: 'less_than_or_equal' },
  ];
  for (const { prefix, operation } of numericOps) {
    if (regex.startsWith(prefix)) {
      return { operation, value: regex.slice(prefix.length) };
    }
  }

  // Negative lookbehind: does not end with — (?<!value)$ (legacy form)
  const doesNotEndWithMatch = regex.match(/^\(\?<!(.+)\)\$$/);
  if (doesNotEndWithMatch && !hasActiveRegexSyntax(doesNotEndWithMatch[1])) {
    return { operation: 'does_not_end_with', value: unescapeRegex(doesNotEndWithMatch[1]) };
  }

  // Negative lookahead: does not end with — ^(?!.*value$).*$ (current
  // frontend form via regexify). Checked BEFORE does_not_contain so the
  // anchored `$` inside the lookahead isn't swallowed by the looser pattern.
  // Accepts either the plain `$` end anchor or the ISO-date-tolerant
  // `(T|$)` anchor that regexify emits for date-shaped values.
  const doesNotEndWithLAMatch = regex.match(/^\^\(\?!\.\*(.+?)(?:\$|\(T\|\$\))\)(?:\.\*\$)?$/);
  if (doesNotEndWithLAMatch && !hasActiveRegexSyntax(doesNotEndWithLAMatch[1])) {
    return { operation: 'does_not_end_with', value: unescapeRegex(doesNotEndWithLAMatch[1]) };
  }

  // Negative lookahead: does not contain — ^(?!.*value) with optional `.*$`
  const doesNotContainMatch = regex.match(/^\^\(\?!\.\*(.+)\)(?:\.\*\$)?$/);
  if (doesNotContainMatch && !hasActiveRegexSyntax(doesNotContainMatch[1])) {
    return { operation: 'does_not_contain', value: unescapeRegex(doesNotContainMatch[1]) };
  }

  // Negative lookahead alt form: does not contain — ^((?!value).)*$
  // (Same semantics as ^(?!.*value); recognized so backend-authored rules
  // round-trip through the rule builder as "Does not contain" rather than
  // landing on the generic "Match pattern" fallback.)
  const doesNotContainAltMatch = regex.match(/^\^\(\(\?!(.+)\)\.\)\*\$$/);
  if (doesNotContainAltMatch && !hasActiveRegexSyntax(doesNotContainAltMatch[1])) {
    return { operation: 'does_not_contain', value: unescapeRegex(doesNotContainAltMatch[1]) };
  }

  // Negative lookahead: does not equal — ^(?!value$) with optional `.*$`.
  // Same ISO-date end-anchor tolerance as above.
  const doesNotEqualMatch = regex.match(/^\^\(\?!(.+?)(?:\$|\(T\|\$\))\)(?:\.\*\$)?$/);
  if (doesNotEqualMatch && !hasActiveRegexSyntax(doesNotEqualMatch[1])) {
    return { operation: 'does_not_equal', value: unescapeRegex(doesNotEqualMatch[1]) };
  }

  // Negative lookahead: does not start with — ^(?!value) with optional `.*$`
  const doesNotStartWithMatch = regex.match(/^\^\(\?!(.+)\)(?:\.\*\$)?$/);
  if (doesNotStartWithMatch && !hasActiveRegexSyntax(doesNotStartWithMatch[1])) {
    return { operation: 'does_not_start_with', value: unescapeRegex(doesNotStartWithMatch[1]) };
  }

  // Equals: ^value$ — accepts either the plain `$` end anchor or the
  // ISO-date-tolerant `(T|$)` anchor emitted by regexify for date values.
  const equalsMatch = regex.match(/^\^(.+?)(?:\$|\(T\|\$\))$/);
  if (equalsMatch && !hasActiveRegexSyntax(equalsMatch[1])) {
    return { operation: 'equals', value: unescapeRegex(equalsMatch[1]) };
  }

  // Begins with: ^value
  const beginsWithMatch = regex.match(/^\^(.+)$/);
  if (beginsWithMatch && !hasActiveRegexSyntax(beginsWithMatch[1])) {
    return { operation: 'begins_with', value: unescapeRegex(beginsWithMatch[1]) };
  }

  // Ends with: value$ — same ISO-date tolerance as equals.
  const endsWithMatch = regex.match(/^(.+?)(?:\$|\(T\|\$\))$/);
  if (endsWithMatch && !hasActiveRegexSyntax(endsWithMatch[1])) {
    return { operation: 'ends_with', value: unescapeRegex(endsWithMatch[1]) };
  }

  // Matches pattern (contains |)
  if (regex.includes('|') && !hasActiveRegexSyntax(regex)) {
    const values = regex.split('|').map(unescapeRegex);
    return { operation: 'matches_pattern', value: values[0], values };
  }

  // Complex regex with active syntax — preserve raw regex
  if (hasActiveRegexSyntax(regex)) {
    return { operation: 'match_regex', value: regex };
  }

  // Default: contains (simple literal text)
  return { operation: 'contains', value: unescapeRegex(regex) };
}

/**
 * Reverse of the `extract_matching` build in `regexifyExtraction`: peel the
 * leading Starting Position skip (`.{N}`) and/or the Occurrence skip
 * (`(?:.*?(?:PAT)){K}.*?`) off the front of an extraction regex so those two
 * fields round-trip on reload instead of being folded into the pattern.
 *
 * Returns null when neither modifier is present so the normal classification
 * in `decomposeExtractionRegex` runs unchanged. The Starting Position `.{N}`
 * is matched as a LITERAL leading token (extract_skip_take's skip is
 * `^`-anchored, so it never matches here). The Occurrence skip is only honored
 * when its inner pattern matches the captured body's pattern, so an unrelated
 * regex can't be mis-peeled.
 *
 * Note: an explicitly-chosen occurrence == 1 emits a `{0}`-repeat skip and
 * round-trips back to 1. UNSET occurrence (undefined) emits no skip at all and
 * stays unset on reload — the two are distinct, though the extraction (first
 * match) is identical either way.
 */
function decomposeMatchingMods(regex: string): {
  operation: ExtractionOperation;
  pattern?: string;
  startingPosition?: number;
  occurrence?: number;
} | null {
  let rest = regex;
  let startingPosition: number | undefined;
  let occurrence: number | undefined;

  const posM = /^\.\{(\d+)\}/.exec(rest);
  if (posM) {
    startingPosition = Number(posM[1]);
    rest = rest.slice(posM[0].length);
  }

  // `(?:.*?(?:PAT)){K}.*?` then the captured body. Verify the skip's PAT equals
  // the captured body so we only treat it as an occurrence skip when it really
  // is. The body is `(PAT)` when regexifyExtraction wrapped a group-less pattern
  // (compare against the STRIPPED body) or PAT itself when the user's pattern
  // already had its own capture group (compare against the RAW body) — accept
  // either, else occurrence silently dropped for grouped patterns like `(\d+)`.
  const occM = /^\(\?:\.\*\?\(\?:([\s\S]+)\)\)\{(\d+)\}\.\*\?([\s\S]+)$/.exec(rest);
  if (occM) {
    const innerPat = occM[1];
    const k = Number(occM[2]);
    const body = occM[3];
    const bodyInner = outerParensPair(body) ? body.slice(1, -1) : body;
    // k >= 0: a `{0}` skip encodes occurrence 1 (see regexifyExtraction) and
    // must decode back to 1, not be ignored. The self-consistency check (skip's
    // inner pattern equals the captured body) still guards against mis-peeling
    // an unrelated regex.
    if (k >= 0 && (bodyInner === innerPat || body === innerPat)) {
      occurrence = k + 1;
      rest = body;
    }
  }

  if (startingPosition === undefined && occurrence === undefined) return null;

  const pattern = outerParensPair(rest) ? rest.slice(1, -1) : rest;
  return { operation: 'extract_matching', pattern, startingPosition, occurrence };
}

export interface ExtractionDecomposition {
  operation: ExtractionOperation;
  prefix?: string;
  suffix?: string;
  pattern?: string;
  suffixOrEndOfInput?: boolean;
  numChars?: number;
  toStr?: string;
  fromPosition?: number;
  toStart?: boolean;
  tillEndOfInput?: boolean;
  startingPosition?: number;
  occurrence?: number;
  prefixOccurrence?: number;
  suffixOccurrence?: number;
}

// A single escaped-literal character: an escaped pair (`\x`) or any char that
// is not a backslash or an unescaped paren. Used to match the literal
// prefix/suffix/toStr tokens `regexifyExtraction` bakes into the regex.
const STRUCT_LIT = String.raw`(?:\\.|[^\\()])`;

/**
 * Locate the FIRST unescaped CAPTURING group `(…)` (skipping `(?:`, `(?=`,
 * lookbehinds, etc.) and split the regex into the text before it, the group's
 * inner content, and the text after. Returns null when there is no capturing
 * group. Balances nested parens so a group like `((?:.*?X){2}.*?)` is captured
 * whole.
 */
function splitCaptureGroup(regex: string): { pre: string; inner: string; post: string } | null {
  for (let i = 0; i < regex.length; i++) {
    if (regex[i] === '\\') { i++; continue; }
    if (regex[i] === '(' && regex[i + 1] !== '?') {
      let depth = 0;
      for (let j = i; j < regex.length; j++) {
        if (regex[j] === '\\') { j++; continue; }
        if (regex[j] === '(') depth++;
        else if (regex[j] === ')' && --depth === 0) {
          return { pre: regex.slice(0, i), inner: regex.slice(i + 1, j), post: regex.slice(j + 1) };
        }
      }
      return null; // unbalanced
    }
  }
  return null;
}

/** Unescape an escaped-literal boundary, or null when it still carries active
 *  regex syntax (so the caller can bail to extract_matching). */
function literalBoundary(escaped: string): string | null {
  if (escaped.length === 0 || looksLikeRegex(escaped)) return null;
  return unescapeRegex(escaped);
}

/**
 * Reverse of the enriched extraction shapes `regexifyExtraction` emits for
 * extract_after / extract_before / extract_between / extract_substring when the
 * operator fills in numChars / toStr / position / occurrence / prefix- or
 * suffix-occurrence. Without this, those shapes fell through to the
 * extract_matching fallback and the method silently reverted to "Extract
 * matching pattern" on reload.
 *
 * Returns null for base shapes (`PRE(.*?)SUF`, `PRE(.*)`, `(.*?)SUF`, …) and
 * anything it can't confidently classify, so the existing classifiers still own
 * them. Runs BEFORE decomposeMatchingMods so a leading `.{P}` substring skip
 * isn't mis-peeled as a matching startingPosition.
 */
function decomposeStructuredExtraction(regex: string): ExtractionDecomposition | null {
  const split = splitCaptureGroup(regex);
  if (!split) return null;
  let { pre } = split;
  const { inner, post } = split;

  // extract_from_start (toStr form): `^(.*?)T` or `^((?:.*?T){K-1}.*?)T`. The
  // leading `^` anchor is what distinguishes it from extract_before (`(.*?)T`).
  // The numChars form (`^(.{N})`) is intentionally NOT decoded here — it is
  // byte-identical to extract_skip_take (fromPosition 0) and is left to that
  // rule, so it reloads as the equivalent method.
  if (pre === '^') {
    const t = literalBoundary(post);
    if (t !== null) {
      if (inner === '.*?') return { operation: 'extract_from_start', toStr: t };
      const m = new RegExp(String.raw`^\(\?:\.\*\?(${STRUCT_LIT}+)\)\{(\d+)\}\.\*\?$`).exec(inner);
      if (m && literalBoundary(m[1]) === t) {
        return { operation: 'extract_from_start', toStr: t, occurrence: Number(m[2]) + 1 };
      }
    }
  }

  // extract_from_end (toStr form): `.*T(.*)$` or `.*T((?:.*?T){K-1}.*)$`. The
  // greedy leading `.*T` + `$` anchor distinguish it. numChars form (`(.{N})$`)
  // is left to extract_last_n_chars (identical shape).
  if (post === '$') {
    const preM = new RegExp(String.raw`^\.\*(${STRUCT_LIT}+)$`).exec(pre);
    if (preM) {
      const t = literalBoundary(preM[1]);
      if (t !== null) {
        if (inner === '.*') return { operation: 'extract_from_end', toStr: t };
        const m = new RegExp(String.raw`^\(\?:\.\*\?(${STRUCT_LIT}+)\)\{(\d+)\}\.\*$`).exec(inner);
        if (m && literalBoundary(m[1]) === t) {
          return { operation: 'extract_from_end', toStr: t, occurrence: Number(m[2]) + 1 };
        }
      }
    }
  }

  // Peel an optional leading occurrence skip `(?:.*?TOKEN){K}.*?`. TOKEN is a
  // literal (no unescaped parens), so the matching-occurrence shape
  // `(?:.*?(?:PAT)){K}.*?` — whose token starts with `(?:` — never matches and
  // is left for decomposeMatchingMods.
  let occurrence: number | undefined;
  const occM = new RegExp(String.raw`^\(\?:\.\*\?(${STRUCT_LIT}+)\)\{(\d+)\}\.\*\?`).exec(pre);
  if (occM) {
    occurrence = Number(occM[2]) + 1;
    pre = pre.slice(occM[0].length);
  }

  // --- classify the three parts ---
  // inner: the capture body.
  const innerNChars = /^\.\{(\d+)\}$/.exec(inner);
  const innerNLazy = /^\.\{0,(\d+)\}\?$/.exec(inner); // numChars + toStr
  const innerSufRepeat = new RegExp(String.raw`^\(\?:\.\*\?(${STRUCT_LIT}+)\)\{(\d+)\}\.\*\?$`).exec(inner);
  const innerRest = inner === '.*';
  const innerLazy = inner === '.*?';

  // post: the trailing boundary (suffix).
  let suffix: string | undefined;
  let suffixOrEndOfInput: boolean | undefined;
  if (post === '') {
    // no suffix
  } else if (post === '$') {
    return null; // `(.{N})$` is extract_last_n_chars — leave it to that rule.
  } else {
    const eoi = new RegExp(String.raw`^\(\?:(${STRUCT_LIT}+)\|\$\)$`).exec(post);
    if (eoi) {
      const s = literalBoundary(eoi[1]);
      if (s === null) return null;
      suffix = s;
      suffixOrEndOfInput = true;
    } else {
      const s = literalBoundary(post);
      if (s === null) return null;
      suffix = s;
    }
  }
  const hasSuffix = suffix !== undefined;

  // pre (after occurrence peel): position skip, greedy `.*TOSTR`, or a prefix.
  const prePos = /^\.\{(\d+)\}$/.exec(pre);
  const preToStr = new RegExp(String.raw`^\.\*(${STRUCT_LIT}+)$`).exec(pre);
  const fromPosition = prePos ? Number(prePos[1]) : undefined;
  const preToStrLit = preToStr ? literalBoundary(preToStr[1]) : null;
  const prefixLit = pre !== '' && !prePos && !preToStr ? literalBoundary(pre) : null;

  // === extract_between with suffixOccurrence: PRE((?:.*?S){M}.*?)SUF ===
  if (innerSufRepeat) {
    if (prefixLit === null || !hasSuffix) return null;
    if (literalBoundary(innerSufRepeat[1]) !== suffix) return null;
    return {
      operation: 'extract_between',
      prefix: prefixLit,
      suffix,
      suffixOrEndOfInput,
      prefixOccurrence: occurrence,
      suffixOccurrence: Number(innerSufRepeat[2]) + 1,
    };
  }

  // === extract_substring: position/empty pre, no prefix literal, no occurrence ===
  // `pre` must be exactly empty or a pure `.{P}` skip — a non-empty
  // unrecognised `pre` (e.g. the `^.{40}` of extract_skip_take) must NOT be
  // treated as position-0 substring.
  if (
    occurrence === undefined
    && prefixLit === null
    && preToStrLit === null
    && (pre === '' || fromPosition !== undefined)
  ) {
    if (!hasSuffix) {
      if (innerNChars) {
        return fromPosition !== undefined
          ? { operation: 'extract_substring', fromPosition, numChars: Number(innerNChars[1]) }
          : { operation: 'extract_substring', numChars: Number(innerNChars[1]) };
      }
      if (innerRest && fromPosition !== undefined) {
        return { operation: 'extract_substring', fromPosition };
      }
      return null; // bare `(.*)` / `(.*?)` — degenerate, leave to base rules.
    }
    // position + literal suffix → capture from P up to toStr.
    if (fromPosition !== undefined) {
      if (innerLazy) return { operation: 'extract_substring', fromPosition, toStr: suffix };
      if (innerNLazy) return { operation: 'extract_substring', fromPosition, numChars: Number(innerNLazy[1]), toStr: suffix };
      return null;
    }
    // pre empty + literal suffix → extract_before (handled below).
  }

  // === extract_before: no prefix, optional greedy `.*TOSTR`, literal suffix ===
  if (hasSuffix && prefixLit === null && (pre === '' || preToStrLit !== null)) {
    const toStr = preToStrLit ?? undefined;
    if (innerLazy) {
      // base before (no toStr, no occurrence) → let the existing rule handle it.
      if (toStr === undefined && occurrence === undefined) return null;
      return { operation: 'extract_before', suffix, suffixOrEndOfInput, toStr, occurrence };
    }
    if (innerNChars && toStr === undefined) {
      return { operation: 'extract_before', suffix, suffixOrEndOfInput, numChars: Number(innerNChars[1]), occurrence };
    }
    if (innerNLazy && toStr !== undefined) {
      return { operation: 'extract_before', suffix, suffixOrEndOfInput, numChars: Number(innerNLazy[1]), toStr, occurrence };
    }
    return null;
  }

  // === extract_after / extract_between (a literal prefix is present) ===
  if (prefixLit !== null) {
    if (!hasSuffix) {
      if (innerRest) {
        // base after (no occurrence) → let the existing rule handle it.
        if (occurrence === undefined) return null;
        return { operation: 'extract_after', prefix: prefixLit, occurrence };
      }
      if (innerNChars) {
        return { operation: 'extract_after', prefix: prefixLit, numChars: Number(innerNChars[1]), occurrence };
      }
      return null;
    }
    // prefix + literal suffix.
    if (innerLazy) {
      // PRE(.*?)SUF → base between; only claim when an occurrence skip made it
      // enriched (prefixOccurrence), else let the base between rule handle it.
      if (occurrence === undefined) return null;
      return { operation: 'extract_between', prefix: prefixLit, suffix, suffixOrEndOfInput, prefixOccurrence: occurrence };
    }
    if (innerNLazy) {
      // PRE(.{0,N}?)TOSTR → extract_after with numChars + toStr.
      return { operation: 'extract_after', prefix: prefixLit, numChars: Number(innerNLazy[1]), toStr: suffix, occurrence };
    }
    return null;
  }

  return null;
}

/**
 * Decomposes an extraction regex into structured operation + params.
 *
 * Goal: structured fields (prefix, suffix) only ever hold LITERAL text. Any
 * regex syntax in the regex falls back to `extract_matching` so the user sees
 * the raw pattern in one box rather than fragmented across "literal" inputs.
 */
export function decomposeExtractionRegex(regex: string): ExtractionDecomposition {
  // Structured enriched shapes (numChars / toStr / position / occurrence /
  // prefix|suffix-occurrence) first — before decomposeMatchingMods, whose
  // leading-`.{P}` peel would otherwise swallow a substring position skip.
  const structured = decomposeStructuredExtraction(regex);
  if (structured) return structured;

  // 0. Extract matching with leading Starting Position / Occurrence skips.
  //    regexifyExtraction encodes startingPosition as a leading `.{N}` and
  //    occurrence>1 as a `(?:.*?(?:PAT)){K}.*?` skip in front of the captured
  //    body. Recover them here so those fields repopulate on reload instead of
  //    being folded into the pattern (which also dragged the `.{N}` into the
  //    pattern via the lookaround branch below). Must run before rule 1 so a
  //    pattern containing a lookbehind still gives up its leading skip.
  const withMods = decomposeMatchingMods(regex);
  if (withMods) return withMods;

  // 1. Lookarounds anywhere → matching pattern. Lookbehinds and lookaheads
  //    can't be expressed as literal prefix/suffix, so the entire regex stays
  //    raw. Covers ~50 production rules (negative lookahead "does-not-contain"
  //    style, positive lookbehind for IBAN-prefix patterns, etc.).
  if (/\(\?<=|\(\?<!|\(\?=|\(\?!/.test(regex)) {
    return { operation: 'extract_matching', pattern: regex };
  }

  // 2. Multi-token alternation in a leading non-capturing group → matching
  //    pattern. Shapes like `(?:A|B|C).*` can't be a single literal prefix.
  if (/^\^?\(\?:[^)]*\|[^)]*\)/.test(regex)) {
    return { operation: 'extract_matching', pattern: regex };
  }

  // 3. Extract All canonicalisation. `^(.*)`, `^(.*)$`, `^([\s\S]*)$`, and
  //    `^([\s\S]*)` all behave identically on single-line transaction text.
  //    Collapse them into the single `extract_full_field` method.
  if (/^\^\((?:\.\*|\[\\s\\S\]\*)\)\$?$/.test(regex)) {
    return { operation: 'extract_full_field' };
  }

  // 3b. Extract last N characters: `(.{N})$`. Matches the trailing N chars of
  //     the source field. Must be checked before the catch-all outer-parens
  //     branch below — that branch would otherwise strip the parens and route
  //     this through `extract_matching`, losing the N-chars metadata.
  const lastNCharsMatch = regex.match(/^\(\.\{(\d+)\}\)\$$/);
  if (lastNCharsMatch) {
    return { operation: 'extract_last_n_chars', numChars: Number(lastNCharsMatch[1]) };
  }

  // 3c. Skip n and take y / till end: `^.{n}(.{y})` or `^.{n}(.*)`. The leading
  //     `^` plus an explicit `.{n}` skip keep it distinct from extract_after and
  //     extract_full_field. Must precede the between/after branches below, which
  //     would otherwise route `^.{n}(.*)` to extract_matching (the `^.{n}`
  //     prefix "looks like regex"). The skip-0 forms collapse elsewhere:
  //     `^(.*)` → extract_full_field (step 3); `^(.{y})` is handled just below.
  const skipTakeMatch = regex.match(/^\^\.\{(\d+)\}\((?:\.\{(\d+)\}|\.\*)\)$/);
  if (skipTakeMatch) {
    const fromPosition = Number(skipTakeMatch[1]);
    return skipTakeMatch[2] !== undefined
      ? { operation: 'extract_skip_take', fromPosition, numChars: Number(skipTakeMatch[2]) }
      : { operation: 'extract_skip_take', fromPosition, tillEndOfInput: true };
  }
  // Skip-0 take-y: `^(.{y})` (the skip prefix is omitted when n is 0).
  const skipTakeNoSkipMatch = regex.match(/^\^\(\.\{(\d+)\}\)$/);
  if (skipTakeNoSkipMatch) {
    return { operation: 'extract_skip_take', fromPosition: 0, numChars: Number(skipTakeNoSkipMatch[1]) };
  }

  // 4. Extract between: prefix(.*?)suffix — try the suffix-with-end-of-input
  //    form first, since the literal-suffix branch would otherwise match it.
  //    Production patterns: `/ORDP/(.*?)(?:/|$)` (~373 rules).
  const extractBetweenWithEoiMatch = regex.match(/^(.+?)\(\.\*\?\)\(\?:(.+?)\|\$\)$/);
  if (extractBetweenWithEoiMatch) {
    const prefix = unescapeRegex(extractBetweenWithEoiMatch[1]);
    const suffix = unescapeRegex(extractBetweenWithEoiMatch[2]);
    if (!looksLikeRegex(prefix) && !looksLikeRegex(suffix)) {
      return { operation: 'extract_between', prefix, suffix, suffixOrEndOfInput: true };
    }
    return { operation: 'extract_matching', pattern: regex };
  }

  const extractBetweenMatch = regex.match(/^(.+?)\(\.\*\?\)(.+)$/);
  if (extractBetweenMatch) {
    const prefix = unescapeRegex(extractBetweenMatch[1]);
    const suffix = unescapeRegex(extractBetweenMatch[2]);
    if (!looksLikeRegex(prefix) && !looksLikeRegex(suffix)) {
      return { operation: 'extract_between', prefix, suffix };
    }
    return { operation: 'extract_matching', pattern: regex };
  }

  // Extract after: prefix(.*)
  const extractAfterMatch = regex.match(/^(.+)\(\.\*\)$/);
  if (extractAfterMatch) {
    const prefix = unescapeRegex(extractAfterMatch[1]);
    if (!looksLikeRegex(prefix)) {
      return { operation: 'extract_after', prefix };
    }
    return { operation: 'extract_matching', pattern: regex };
  }

  // Extract before: (.*?)suffix — try the with-end-of-input form first.
  const extractBeforeWithEoiMatch = regex.match(/^\(\.\*\?\)\(\?:(.+?)\|\$\)$/);
  if (extractBeforeWithEoiMatch) {
    const suffix = unescapeRegex(extractBeforeWithEoiMatch[1]);
    if (!looksLikeRegex(suffix)) {
      return { operation: 'extract_before', suffix, suffixOrEndOfInput: true };
    }
    return { operation: 'extract_matching', pattern: regex };
  }

  const extractBeforeMatch = regex.match(/^\(\.\*\?\)(.+)$/);
  if (extractBeforeMatch) {
    const suffix = unescapeRegex(extractBeforeMatch[1]);
    if (!looksLikeRegex(suffix)) {
      return { operation: 'extract_before', suffix };
    }
    return { operation: 'extract_matching', pattern: regex };
  }

  // Extract matching: (pattern)
  // Only strip outer parens when they actually pair — i.e. the `(` at index 0
  // matches the `)` at the last index. Otherwise a regex like `(?:.*?-){2}(-)`
  // (which starts with `(?:` and ends with `)` from its final capture group)
  // would get mangled into `?:.*?-){2}(-`.
  if (outerParensPair(regex)) {
    return {
      operation: 'extract_matching',
      pattern: regex.slice(1, -1),
    };
  }

  // Fallback — preserve the full regex as the pattern so users still see it.
  return { operation: 'extract_matching', pattern: regex };
}

/**
 * Returns true when `str` begins with `(` and ends with `)` AND that opening
 * paren's matching close is the very last character — i.e. the outer parens
 * wrap the entire regex as a single group. Ignores escaped parens (`\(`, `\)`).
 */
function outerParensPair(str: string): boolean {
  if (str.length < 2 || str[0] !== '(' || str[str.length - 1] !== ')') return false;
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i === str.length - 1;
    }
  }
  return false;
}
