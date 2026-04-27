import type { MatchOperation, ExtractionOperation } from '../types';
import { PREDEFINED_PATTERNS } from '../constants/operations';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      return `${escaped}$`;
    case 'contains':
      return escaped;
    case 'does_not_contain':
      // Anchor the whole string so the lookahead is evaluated against it all.
      return `^(?!.*${escaped}).*$`;
    case 'equals':
      return `^${escaped}$`;
    case 'does_not_equal':
      return `^(?!${escaped}$).*$`;
    case 'does_not_start_with':
      return `^(?!${escaped}).*$`;
    case 'does_not_end_with':
      // Use negative lookahead at start (anchored), not variable-length lookbehind,
      // for broader regex-engine compatibility.
      return `^(?!.*${escaped}$).*$`;
    case 'matches_pattern': {
      const vals = values && values.length > 0 ? values : [value];
      return `^(${vals.map(escapeRegex).join('|')})$`;
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

export function regexifyExtraction(
  operation: ExtractionOperation,
  params: {
    prefix?: string; suffix?: string; pattern?: string; verifyValue?: string;
    numChars?: number; toStr?: string; toStart?: boolean; occurrence?: number; startingPosition?: number;
    fromPosition?: number; prefixOccurrence?: number; suffixOccurrence?: number;
  }
): string {
  if (operation.startsWith('predefined:')) {
    const def = PREDEFINED_PATTERNS.find((p) => p.key === operation);
    return def?.regex ?? '(.*)';
  }
  const occ = params.occurrence && params.occurrence > 1 ? params.occurrence : 0;

  switch (operation) {
    case 'extract_between': {
      const pre = escapeRegex(params.prefix ?? '');
      const suf = escapeRegex(params.suffix ?? '');
      const preOcc = params.prefixOccurrence && params.prefixOccurrence > 1 ? params.prefixOccurrence : 0;
      const sufOcc = params.suffixOccurrence && params.suffixOccurrence > 1 ? params.suffixOccurrence : 0;
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
      const suf = escapeRegex(params.suffix ?? '');
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
      return `Start with '${value}'`;
    case 'ends_with':
      return `End with '${value}'`;
    case 'contains':
      return `Contain '${value}'`;
    case 'does_not_contain':
      return `Not contain '${value}'`;
    case 'equals':
      return `Equal '${value}'`;
    case 'does_not_equal':
      return `Not equal '${value}'`;
    case 'does_not_start_with':
      return `Does not start with '${value}'`;
    case 'does_not_end_with':
      return `Does not end with '${value}'`;
    case 'matches_pattern': {
      const vals = values && values.length > 0 ? values : [value];
      return `Match one of: ${vals.map(v => `'${v}'`).join(', ')}`;
    }
    case 'match_regex':
      return `Match pattern '${value}'`;
    case 'greater_than':
      return `Greater than '${value}'`;
    case 'less_than':
      return `Less than '${value}'`;
    case 'greater_than_or_equal':
      return `Greater than or equal to '${value}'`;
    case 'less_than_or_equal':
      return `Less than or equal to '${value}'`;
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
  }
): string {
  if (operation.startsWith('predefined:')) {
    const def = PREDEFINED_PATTERNS.find((p) => p.key === operation);
    return def ? `Match ${def.label}` : 'Extract value';
  }
  const modifiers: string[] = [];
  if (params.numChars && params.numChars > 0) modifiers.push(`${params.numChars} chars`);
  if (params.toStr) modifiers.push(`to '${params.toStr}'`);
  if (params.occurrence && params.occurrence > 1) modifiers.push(`occurrence #${params.occurrence}`);
  if (params.startingPosition && params.startingPosition > 0) modifiers.push(`from position ${params.startingPosition}`);
  const suffix = modifiers.length > 0 ? ` (${modifiers.join(', ')})` : '';

  switch (operation) {
    case 'extract_between': {
      const betweenMods: string[] = [];
      if (params.prefixOccurrence && params.prefixOccurrence > 1) betweenMods.push(`prefix #${params.prefixOccurrence}`);
      if (params.suffixOccurrence && params.suffixOccurrence > 1) betweenMods.push(`suffix #${params.suffixOccurrence}`);
      const betweenSuffix = betweenMods.length > 0 ? ` (${betweenMods.join(', ')})` : '';
      return `Extract between '${params.prefix ?? ''}' and '${params.suffix ?? ''}'${betweenSuffix}`;
    }
    case 'extract_after':
      return `Extract after '${params.prefix ?? ''}'${suffix}`;
    case 'extract_before':
      return `Extract before '${params.suffix ?? ''}'${suffix}`;
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
    case 'extract_between_and_verify':
      return `Extract between '${params.prefix ?? ''}' and '${params.suffix ?? ''}', verify = '${params.verifyValue ?? ''}'`;
    case 'extract_full_field':
      return 'Extract full field';
    default:
      return 'Extract value';
  }
}
