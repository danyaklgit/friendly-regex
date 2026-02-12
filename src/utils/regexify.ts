import type { MatchOperation, ExtractionOperation } from '../types';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function regexify(operation: MatchOperation, value: string, values?: string[]): string {
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
    default:
      return escaped;
  }
}

export function regexifyExtraction(
  operation: ExtractionOperation,
  params: { prefix?: string; suffix?: string; pattern?: string }
): string {
  switch (operation) {
    case 'extract_between':
      return `${escapeRegex(params.prefix ?? '')}(.*?)${escapeRegex(params.suffix ?? '')}`;
    case 'extract_after':
      return `${escapeRegex(params.prefix ?? '')}(.*)`;
    case 'extract_before':
      return `(.*?)${escapeRegex(params.suffix ?? '')}`;
    case 'extract_matching':
      return `(${params.pattern ?? '.*'})`;
    default:
      return '(.*)';
  }
}

export function generateExpressionPrompt(operation: MatchOperation, value: string, values?: string[]): string {
  switch (operation) {
    case 'begins_with':
      return `Begin with '${value}'`;
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
    default:
      return value;
  }
}

export function generateExtractionPrompt(
  operation: ExtractionOperation,
  params: { prefix?: string; suffix?: string; pattern?: string }
): string {
  switch (operation) {
    case 'extract_between':
      return `Extract between '${params.prefix ?? ''}' and '${params.suffix ?? ''}'`;
    case 'extract_after':
      return `Extract after '${params.prefix ?? ''}'`;
    case 'extract_before':
      return `Extract before '${params.suffix ?? ''}'`;
    case 'extract_matching':
      return `Extract matching '${params.pattern ?? ''}'`;
    default:
      return 'Extract value';
  }
}
