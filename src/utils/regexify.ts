import type { MatchOperation, ExtractionOperation } from '../types';
import { PREDEFINED_PATTERNS } from '../constants/operations';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      return `^(?!.*${escaped})`;
    case 'equals':
      return `^${escaped}$`;
    case 'does_not_equal':
      return `^(?!${escaped}$)`;
    case 'does_not_start_with':
      return `^(?!${escaped})`;
    case 'does_not_end_with':
      return `(?<!${escaped})$`;
    case 'matches_pattern': {
      const vals = values && values.length > 0 ? values : [value];
      return vals.map(escapeRegex).join('|');
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
  if (hasN && hasTo) return `${escapeRegex(toStr)}(.{0,${numChars}}?)`;
  if (hasN) return `(.{${numChars}})`;
  if (hasTo) return `${escapeRegex(toStr)}(.*?)`;
  return '(.*?)';
}

export function regexifyExtraction(
  operation: ExtractionOperation,
  params: {
    prefix?: string; suffix?: string; pattern?: string; verifyValue?: string;
    numChars?: number; toStr?: string; occurrence?: number; startingPosition?: number;
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
      const sufSkip = sufOcc ? `(?:.*?${suf}){${sufOcc - 1}}.*?` : '';
      return `${preSkip}${pre}${sufSkip}(.*?)${suf}`;
    }
    case 'extract_after': {
      const pre = escapeRegex(params.prefix ?? '');
      const skip = occ ? `(?:.*?${pre}){${occ - 1}}.*?` : '';
      return `${skip}${pre}${buildCapture(params.numChars, params.toStr)}`;
    }
    case 'extract_before': {
      const suf = escapeRegex(params.suffix ?? '');
      const skip = occ ? `(?:.*?${suf}){${occ - 1}}.*?` : '';
      return `${skip}${buildCaptureBefore(params.numChars, params.toStr)}${suf}`;
    }
    case 'extract_matching': {
      const pat = params.pattern ?? '.*';
      const posSkip = params.startingPosition && params.startingPosition > 0 ? `.{${params.startingPosition}}` : '';
      const occSkip = occ ? `(?:.*?(?:${pat})){${occ - 1}}.*?` : '';
      return `${posSkip}${occSkip}(${pat})`;
    }
    case 'extract_substring': {
      const pos = params.fromPosition && params.fromPosition > 0 ? `.{${params.fromPosition}}` : '';
      return `${pos}${buildCapture(params.numChars, params.toStr)}`;
    }
    case 'extract_between_and_verify':
      return `${escapeRegex(params.prefix ?? '')}(.*?)${escapeRegex(params.suffix ?? '')}`;
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
    numChars?: number; toStr?: string; occurrence?: number; startingPosition?: number;
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
      if (params.numChars && params.numChars > 0) parts.push(`${params.numChars} chars`);
      if (params.toStr) parts.push(`to '${params.toStr}'`);
      return `Sub-string${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
    }
    case 'extract_between_and_verify':
      return `Extract between '${params.prefix ?? ''}' and '${params.suffix ?? ''}', verify = '${params.verifyValue ?? ''}'`;
    default:
      return 'Extract value';
  }
}
