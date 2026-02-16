import type { MatchOperation, ExtractionOperation } from '../types';
import { PREDEFINED_PATTERNS } from '../constants/operations';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function regexify(
  operation: MatchOperation,
  value: string,
  values?: string[],
  params?: { prefix?: string; suffix?: string }
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
    case 'matches_pattern': {
      const vals = values && values.length > 0 ? values : [value];
      return vals.map(escapeRegex).join('|');
    }
    case 'extract_and_compare':
      return `(?:${escapeRegex(params?.prefix ?? '')})${escaped}(?:${escapeRegex(params?.suffix ?? '')})`;
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
  params: { prefix?: string; suffix?: string; pattern?: string; verifyValue?: string }
): string {
  if (operation.startsWith('predefined:')) {
    const def = PREDEFINED_PATTERNS.find((p) => p.key === operation);
    return def?.regex ?? '(.*)';
  }
  switch (operation) {
    case 'extract_between':
      return `${escapeRegex(params.prefix ?? '')}(.*?)${escapeRegex(params.suffix ?? '')}`;
    case 'extract_after':
      return `${escapeRegex(params.prefix ?? '')}(.*)`;
    case 'extract_before':
      return `(.*?)${escapeRegex(params.suffix ?? '')}`;
    case 'extract_matching':
      return `(${params.pattern ?? '.*'})`;
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
  params?: { prefix?: string; suffix?: string }
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
    case 'matches_pattern': {
      const vals = values && values.length > 0 ? values : [value];
      return `Match one of: ${vals.map(v => `'${v}'`).join(', ')}`;
    }
    case 'extract_and_compare':
      return `Extract between '${params?.prefix ?? ''}' and '${params?.suffix ?? ''}' equals '${value}'`;
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
  params: { prefix?: string; suffix?: string; pattern?: string; verifyValue?: string }
): string {
  if (operation.startsWith('predefined:')) {
    const def = PREDEFINED_PATTERNS.find((p) => p.key === operation);
    return def ? `Match ${def.label}` : 'Extract value';
  }
  switch (operation) {
    case 'extract_between':
      return `Extract between '${params.prefix ?? ''}' and '${params.suffix ?? ''}'`;
    case 'extract_after':
      return `Extract after '${params.prefix ?? ''}'`;
    case 'extract_before':
      return `Extract before '${params.suffix ?? ''}'`;
    case 'extract_matching':
      return `Extract matching '${params.pattern ?? ''}'`;
    case 'extract_between_and_verify':
      return `Extract between '${params.prefix ?? ''}' and '${params.suffix ?? ''}', verify = '${params.verifyValue ?? ''}'`;
    default:
      return 'Extract value';
  }
}
