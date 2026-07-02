import type { MatchOperation, ExtractionOperation } from '../types';
import { PREDEFINED_PATTERNS } from '../constants/operations';

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when a literal value looks like an ISO calendar date (YYYY-MM-DD).
 *  Date-stored fields like StatementDate come back from the backend as full
 *  ISO timestamps (e.g. 2024-01-29T00:00:00Z), so end-anchored regexes built
 *  from a bare date never match server-side. We widen the end anchor with
 *  `(T|$)` when the value is date-shaped, so the regex matches both the
 *  bare date and any ISO timestamp that begins with it. */
function looksLikeIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** End-of-value anchor: `(T|$)` for ISO-date values so a stored
 *  `2024-01-29T00:00:00Z` still matches, plain `$` otherwise. */
function endAnchor(value: string): string {
  return looksLikeIsoDate(value) ? '(T|$)' : '$';
}

/**
 * Returns true if the pattern already contains an unescaped capturing group —
 * i.e. `(...)` or `(?<name>...)`, but not `(?:...)`, `(?=...)`, `(?!...)`,
 * `(?<=...)`, `(?<!...)`, or a literal `\(`. Used to avoid double-wrapping a
 * user pattern that already provides the group we want to extract.
 */
function hasUserCaptureGroup(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '[') {
      i++;
      while (i < pattern.length && pattern[i] !== ']') {
        if (pattern[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === '(') {
      const rest = pattern.slice(i + 1);
      if (/^\?(?::|=|!|<=|<!)/.test(rest)) continue;
      return true;
    }
  }
  return false;
}

export function regexify(
  operation: MatchOperation,
  value: string,
  values?: string[],
): string {
  const escaped = escapeRegex(value);

  switch (operation) {
    case 'begins_with':
      return `^${escaped}`;
    case 'ends_with':
      return `${escaped}${endAnchor(value)}`;
    case 'contains':
      return escaped;
    case 'does_not_contain':
      // Anchor the whole string so the lookahead is evaluated against it all.
      return `^(?!.*${escaped}).*$`;
    case 'equals':
      return `^${escaped}${endAnchor(value)}`;
    case 'does_not_equal':
      return `^(?!${escaped}${endAnchor(value)}).*$`;
    case 'does_not_start_with':
      return `^(?!${escaped}).*$`;
    case 'does_not_end_with':
      // Use negative lookahead at start (anchored), not variable-length lookbehind,
      // for broader regex-engine compatibility.
      return `^(?!.*${escaped}${endAnchor(value)}).*$`;
    case 'matches_pattern': {
      const vals = values && values.length > 0 ? values : [value];
      // Use the ISO-date end anchor only when EVERY value is date-shaped — a
      // mixed list (some dates, some non-dates) would otherwise let a non-date
      // value spuriously match an ISO timestamp prefix like "CODET...".
      const tail = vals.every(looksLikeIsoDate) ? '(T|$)' : '$';
      return `^(${vals.map(escapeRegex).join('|')})${tail}`;
    }
    case 'match_regex':
      return value;
    case 'greater_than':
      return `__NUMERIC_GT:${value}`;
    case 'less_than':
      return `__NUMERIC_LT:${value}`;
    case 'greater_than_or_equal':
      return `__NUMERIC_GTE:${value}`;
    case 'less_than_or_equal':
      return `__NUMERIC_LTE:${value}`;
    case 'is_blank_or_empty':
      // Frontend-only nullary blank check. The regex matches empty,
      // whitespace-only, or dash-only values — the standalone-space and
      // standalone-`-` arms of "considered empty" per the operator's
      // mental model. The null arm is handled separately:
      //   * buildRulesetFilters SKIPS this condition from the server
      //     payload (a regex can't match a NULL column in SQL), so the
      //     server returns null-column rows in the first place.
      //   * evaluateRuleSet (client-side) treats null/undefined as a
      //     match for this regex shape, and TransactionsTab applies a
      //     defensive client-side post-filter using that evaluator so
      //     null rows survive the view-layer filter chain.
      return `^[\\s-]*$`;
    case 'is_not_blank_or_empty':
      // Symmetric counterpart: at least one character that is neither
      // whitespace nor a dash. Anchored so client-side regex evaluation
      // is unambiguous; the server-side path naturally drops null
      // columns (SQL regex against NULL returns NULL/false) which is
      // exactly what we want — null is "blank", so it should NOT pass
      // this filter.
      return `^.*[^\\s-].*$`;
    default:
      return escaped;
  }
}

/** Build a forward capture group: numChars limits length, toStr limits by delimiter, both = whichever comes first */
function buildCapture(numChars?: number, toStr?: string): string {
  const hasN = numChars && numChars > 0;
  const hasTo = !!toStr;
  if (hasN && hasTo) return `(.{0,${numChars}}?)${escapeRegex(toStr)}`;
  if (hasN) return `(.{${numChars}})`;
  if (hasTo) return `(.*?)${escapeRegex(toStr)}`;
  return '(.*)';
}

/** Build a backward capture group (for extract_before): capture precedes the suffix */
function buildCaptureBefore(numChars?: number, toStr?: string): string {
  const hasN = numChars && numChars > 0;
  const hasTo = !!toStr;
  // Use greedy .* before toStr so backtracking anchors to the LAST occurrence
  // of toStr before the suffix (e.g. "...NAR3/2 /EXCH/1" with toStr=" " and
  // suffix="/1" → capture "/EXCH", not "FOR INFORMATION ... /EXCH").
  if (hasN && hasTo) return `.*${escapeRegex(toStr)}(.{0,${numChars}}?)`;
  if (hasN) return `(.{${numChars}})`;
  if (hasTo) return `.*${escapeRegex(toStr)}(.*?)`;
  return '(.*?)';
}

/**
 * Adapts a regex sourced from the EXTRACTIONS LOV into a form usable by the
 * extraction pipeline.
 *
 * 1. If the LOV entry already exposes a capture group, the regex passes
 *    through verbatim.
 * 2. Otherwise the pattern is wrapped so the server has a group to lift the
 *    captured value out of.
 * 3. A trailing `$` is dropped on the way through, since LOV regexes are
 *    typically written for VALIDATION (must match the whole field) but the
 *    user is using them for EXTRACTION (lift the matching span out of
 *    whatever the field contains). Keeping `$` would block extraction on
 *    longer fields — e.g. `^SA\d{2}[A-Z0-9]{18}$` against a 24-char IBAN.
 *
 * Used at save time AND at load time (to keep the LOV catalog lookup in
 * cloneRulesAndAttributesFrom in sync).
 */
export function ensureLovExtractionCaptureGroup(raw: string): string {
  if (hasUserCaptureGroup(raw)) return raw;
  // Anchored `^...$` → keep `^`, drop trailing `$`, place capture inside.
  const fullyAnchored = raw.match(/^\^([\s\S]*)\$$/);
  if (fullyAnchored) return `^(${fullyAnchored[1]})`;
  // Just end-anchored `...$` → drop trailing `$`, wrap.
  const endAnchored = raw.match(/^([\s\S]*)\$$/);
  if (endAnchored) return `(${endAnchored[1]})`;
  return `(${raw})`;
}

export function regexifyExtraction(
  operation: ExtractionOperation,
  params: {
    prefix?: string; suffix?: string; pattern?: string; verifyValue?: string;
    numChars?: number; toStr?: string; toStart?: boolean; occurrence?: number; startingPosition?: number;
    fromPosition?: number; prefixOccurrence?: number; suffixOccurrence?: number;
    suffixOrEndOfInput?: boolean; tillEndOfInput?: boolean;
  }
): string {
  if (operation.startsWith('predefined:')) {
    const def = PREDEFINED_PATTERNS.find((p) => p.key === operation);
    return def?.regex ?? '(.*)';
  }
  // LOV-driven extraction: the part after `lov:` IS the regex (per the
  // EXTRACTIONS LOV contract where the item's Tags[0] field stores the
  // regex). Wrap validation-style patterns so the server can lift the
  // matched span out — see ensureLovExtractionCaptureGroup for details.
  if (operation.startsWith('lov:')) {
    return ensureLovExtractionCaptureGroup(operation.slice(4));
  }
  // Emit the occurrence skip for occurrence >= 1 (not just > 1). occurrence 1
  // produces a `{0}`-repeat skip (`(?:.*?PAT){0}.*?…`) — a no-op for matching
  // but a marker the decoder can recover, so an explicitly-chosen "1st
  // occurrence" round-trips instead of vanishing into the unset/default state.
  // UNSET occurrence (undefined) still emits nothing, so the default keeps a
  // clean regex and stays unset on reload.
  const occ = params.occurrence && params.occurrence >= 1 ? params.occurrence : 0;
  // Wrap the literal suffix as `(?:<suf>|$)` when the user opted into
  // end-of-input as an alternative boundary. Empty suffix degrades to `$`
  // alone (no spurious empty alternation).
  const sufWithOptionalEoi = (escaped: string) =>
    params.suffixOrEndOfInput ? (escaped ? `(?:${escaped}|$)` : '$') : escaped;

  switch (operation) {
    case 'extract_between': {
      const pre = escapeRegex(params.prefix ?? '');
      const suf = sufWithOptionalEoi(escapeRegex(params.suffix ?? ''));
      // `>= 1` (not `> 1`) so an explicit prefix/suffix occurrence of 1 emits a
      // `{0}`-repeat marker and round-trips, matching the shared `occ` handling
      // above. Unset (undefined) still emits nothing.
      const preOcc = params.prefixOccurrence && params.prefixOccurrence >= 1 ? params.prefixOccurrence : 0;
      const sufOcc = params.suffixOccurrence && params.suffixOccurrence >= 1 ? params.suffixOccurrence : 0;
      const preSkip = preOcc ? `(?:.*?${pre}){${preOcc - 1}}.*?` : '';
      // For suffixOccurrence N, the capture must span from prefix to the Nth
      // suffix. Fold the skip for earlier suffixes into the capture group so
      // the engine captures everything up to (but not including) the Nth suffix.
      const sufRepeat = sufOcc ? `(?:.*?${suf}){${sufOcc - 1}}` : '';
      return `${preSkip}${pre}(${sufRepeat}.*?)${suf}`;
    }
    case 'extract_after': {
      const pre = escapeRegex(params.prefix ?? '');
      const skip = occ ? `(?:.*?${pre}){${occ - 1}}.*?` : '';
      // Default: capture everything after the prefix (all remaining content).
      // With numChars → fixed-length capture; with toStr → lazy capture up to
      // the first occurrence of toStr.
      return `${skip}${pre}${buildCapture(params.numChars, params.toStr)}`;
    }
    case 'extract_before': {
      const suf = sufWithOptionalEoi(escapeRegex(params.suffix ?? ''));
      const skip = occ ? `(?:.*?${suf}){${occ - 1}}.*?` : '';
      // Default: capture everything before the suffix (lazy, so we stop at the
      // first occurrence of the suffix). With toStr → capture between the
      // first toStr and the suffix; with numChars → the N chars directly
      // before the suffix.
      return `${skip}${buildCaptureBefore(params.numChars, params.toStr)}${suf}`;
    }
    case 'extract_matching': {
      const pat = params.pattern ?? '.*';
      const posSkip = params.startingPosition && params.startingPosition > 0 ? `.{${params.startingPosition}}` : '';
      const occSkip = occ ? `(?:.*?(?:${pat})){${occ - 1}}.*?` : '';
      // If the user's pattern already has its own capture group, don't wrap
      // in another — otherwise group 1 becomes the full match instead of
      // the user's intended capture (backend uses the user's group).
      const body = hasUserCaptureGroup(pat) ? pat : `(${pat})`;
      return `${posSkip}${occSkip}${body}`;
    }
    case 'extract_substring': {
      if (params.toStart && params.fromPosition && params.fromPosition > 0) {
        return `(.{${params.fromPosition}})`;
      }
      const pos = params.fromPosition && params.fromPosition > 0 ? `.{${params.fromPosition}}` : '';
      return `${pos}${buildCapture(params.numChars, params.toStr)}`;
    }
    case 'extract_last_n_chars': {
      // Anchor at end-of-input so the regex engine pins the capture to the
      // trailing N chars. With no N set we degrade to a full-field capture so
      // the rule stays compilable while the operator finishes filling it in.
      if (params.numChars && params.numChars > 0) {
        return `(.{${params.numChars}})$`;
      }
      return '(.*)';
    }
    case 'extract_skip_take': {
      // Skip the first N chars (start-anchored) then capture: a fixed `numChars`
      // window, or everything to end-of-input when `tillEndOfInput`. The N=0
      // skip is omitted (no `.{0}`), matching the extract_substring convention.
      // With no count and no till-end flag, degrade to capturing the rest so the
      // rule stays compilable while the operator finishes filling it in.
      const skip = params.fromPosition && params.fromPosition > 0 ? `.{${params.fromPosition}}` : '';
      if (!params.tillEndOfInput && params.numChars && params.numChars > 0) {
        return `^${skip}(.{${params.numChars}})`;
      }
      return `^${skip}(.*)`;
    }
    case 'extract_between_and_verify':
      return `${escapeRegex(params.prefix ?? '')}(.*?)${escapeRegex(params.suffix ?? '')}`;
    case 'extract_full_field':
      // Capture the entire source field, including newlines. Anchored so the
      // pattern is unambiguous on round-trip via decomposeExtractionRegex.
      return '^([\\s\\S]*)$';
    default:
      return '(.*)';
  }
}

export function generateExpressionPrompt(
  operation: MatchOperation,
  value: string,
  values?: string[],
): string {
  switch (operation) {
    case 'begins_with':
      return `Starts with '${value}'`;
    case 'ends_with':
      return `Ends with '${value}'`;
    case 'contains':
      return `Contains '${value}'`;
    case 'does_not_contain':
      return `Does not contain '${value}'`;
    case 'equals':
      return `Equals '${value}'`;
    case 'does_not_equal':
      return `Does not equal '${value}'`;
    case 'does_not_start_with':
      return `Does not start with '${value}'`;
    case 'does_not_end_with':
      return `Does not end with '${value}'`;
    case 'matches_pattern': {
      const vals = values && values.length > 0 ? values : [value];
      return `Matches one of: ${vals.map(v => `'${v}'`).join(', ')}`;
    }
    case 'match_regex':
      return `Matches pattern '${value}'`;
    case 'greater_than':
      return `Greater than '${value}'`;
    case 'less_than':
      return `Less than '${value}'`;
    case 'greater_than_or_equal':
      return `Greater than or equal to '${value}'`;
    case 'less_than_or_equal':
      return `Less than or equal to '${value}'`;
    case 'is_blank_or_empty':
      return `Is blank or empty`;
    case 'is_not_blank_or_empty':
      return `Is not blank or empty`;
    default:
      return value;
  }
}

export function generateExtractionPrompt(
  operation: ExtractionOperation,
  params: {
    prefix?: string; suffix?: string; pattern?: string; verifyValue?: string;
    numChars?: number; toStr?: string; toStart?: boolean; occurrence?: number; startingPosition?: number;
    fromPosition?: number; prefixOccurrence?: number; suffixOccurrence?: number;
    suffixOrEndOfInput?: boolean; tillEndOfInput?: boolean;
  }
): string {
  if (operation.startsWith('predefined:')) {
    const def = PREDEFINED_PATTERNS.find((p) => p.key === operation);
    return def ? `Match ${def.label}` : 'Extract value';
  }
  // LOV-driven extraction: this util has no access to the LOV catalog, so we
  // surface the regex directly. UI consumers with LOV context (AttributeEditor,
  // RulePreview) override this with the LOV item's friendly Name.
  if (operation.startsWith('lov:')) {
    return `Match pattern '${operation.slice(4)}'`;
  }
  const modifiers: string[] = [];
  if (params.numChars && params.numChars > 0) modifiers.push(`${params.numChars} chars`);
  if (params.toStr) modifiers.push(`to '${params.toStr}'`);
  if (params.occurrence && params.occurrence > 1) modifiers.push(`occurrence #${params.occurrence}`);
  if (params.startingPosition && params.startingPosition > 0) modifiers.push(`from position ${params.startingPosition}`);
  const suffix = modifiers.length > 0 ? ` (${modifiers.join(', ')})` : '';
  const suffixDisplay = (raw: string) => params.suffixOrEndOfInput
    ? (raw ? `'${raw}' or end of input` : 'end of input')
    : `'${raw}'`;

  switch (operation) {
    case 'extract_between': {
      const betweenMods: string[] = [];
      if (params.prefixOccurrence && params.prefixOccurrence > 1) betweenMods.push(`prefix #${params.prefixOccurrence}`);
      if (params.suffixOccurrence && params.suffixOccurrence > 1) betweenMods.push(`suffix #${params.suffixOccurrence}`);
      const betweenSuffix = betweenMods.length > 0 ? ` (${betweenMods.join(', ')})` : '';
      return `Extract between '${params.prefix ?? ''}' and ${suffixDisplay(params.suffix ?? '')}${betweenSuffix}`;
    }
    case 'extract_after':
      return `Extract after '${params.prefix ?? ''}'${suffix}`;
    case 'extract_before':
      return `Extract before ${suffixDisplay(params.suffix ?? '')}${suffix}`;
    case 'extract_matching':
      return `Extract matching '${params.pattern ?? ''}'${suffix}`;
    case 'extract_substring': {
      const parts: string[] = [];
      if (params.fromPosition && params.fromPosition > 0) parts.push(`from position ${params.fromPosition}`);
      if (params.toStart) parts.push('to start');
      if (params.numChars && params.numChars > 0) parts.push(`${params.numChars} chars`);
      if (params.toStr) parts.push(`to '${params.toStr}'`);
      return `Sub-string${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
    }
    case 'extract_last_n_chars':
      return params.numChars && params.numChars > 0
        ? `Extract last ${params.numChars} character${params.numChars === 1 ? '' : 's'}`
        : 'Extract last n characters';
    case 'extract_skip_take': {
      const n = params.fromPosition && params.fromPosition > 0 ? params.fromPosition : 0;
      const skip = `Skip ${n} character${n === 1 ? '' : 's'}`;
      if (!params.tillEndOfInput && params.numChars && params.numChars > 0) {
        return `${skip}, then take ${params.numChars} character${params.numChars === 1 ? '' : 's'}`;
      }
      return `${skip}, then take everything till end of input`;
    }
    case 'extract_between_and_verify':
      return `Extract between '${params.prefix ?? ''}' and '${params.suffix ?? ''}', verify = '${params.verifyValue ?? ''}'`;
    case 'extract_full_field':
      return 'Extract full field';
    default:
      return 'Extract value';
  }
}
