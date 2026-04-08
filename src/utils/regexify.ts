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

export function regexifyExtraction(
  operation: ExtractionOperation,
  params: {
    prefix?: string; suffix?: string; pattern?: string; verifyValue?: string;
    numChars?: number; toStr?: string; occurrence?: number; startingPosition?: number;
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
      const skip = occ ? `(?:.*?${pre}.*?${suf}){${occ - 1}}.*?` : '';
      return `${skip}${pre}(.*?)${suf}`;
    }
    case 'extract_after': {
      const pre = escapeRegex(params.prefix ?? '');
      const skip = occ ? `(?:.*?${pre}){${occ - 1}}.*?` : '';
      let capture: string;
      if (params.numChars && params.numChars > 0) capture = `(.{${params.numChars}})`;
      else if (params.toStr) capture = `(.*?)${escapeRegex(params.toStr)}`;
      else capture = '(.*)';
      return `${skip}${pre}${capture}`;
    }
    case 'extract_before': {
      const suf = escapeRegex(params.suffix ?? '');
      const skip = occ ? `(?:.*?${suf}){${occ - 1}}.*?` : '';
      let capture: string;
      if (params.numChars && params.numChars > 0) capture = `(.{${params.numChars}})`;
      else if (params.toStr) capture = `${escapeRegex(params.toStr)}(.*?)`;
      else capture = '(.*?)';
      return `${skip}${capture}${suf}`;
    }
    case 'extract_matching': {
      const pat = params.pattern ?? '.*';
      const posSkip = params.startingPosition && params.startingPosition > 0 ? `.{${params.startingPosition}}` : '';
      const occSkip = occ ? `(?:.*?(?:${pat})){${occ - 1}}.*?` : '';
      return `${posSkip}${occSkip}(${pat})`;
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
    case 'extract_between':
      return `Extract between '${params.prefix ?? ''}' and '${params.suffix ?? ''}'${suffix}`;
    case 'extract_after':
      return `Extract after '${params.prefix ?? ''}'${suffix}`;
    case 'extract_before':
      return `Extract before '${params.suffix ?? ''}'${suffix}`;
    case 'extract_matching':
      return `Extract matching '${params.pattern ?? ''}'${suffix}`;
    case 'extract_between_and_verify':
      return `Extract between '${params.prefix ?? ''}' and '${params.suffix ?? ''}', verify = '${params.verifyValue ?? ''}'`;
    default:
      return 'Extract value';
  }
}
