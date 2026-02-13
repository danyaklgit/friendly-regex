import type { MatchOperation, ExtractionOperation } from '../types';

function unescapeRegex(str: string): string {
  return str.replace(/\\([.*+?^${}()|[\]\\])/g, '$1');
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
  // Extract and compare: (?:prefix)value(?:suffix)
  const extractAndCompareMatch = regex.match(/^\(\?:(.+?)\)(.+)\(\?:(.+)\)$/);
  if (extractAndCompareMatch) {
    return `Extract between '${unescapeRegex(extractAndCompareMatch[1])}' and '${unescapeRegex(extractAndCompareMatch[3])}' equals '${unescapeRegex(extractAndCompareMatch[2])}'`;
  }

  // Negative lookahead: does not contain
  const doesNotContainMatch = regex.match(/^\^\(\?!\.\*(.+)\)$/);
  if (doesNotContainMatch) {
    return `Does not contain '${unescapeRegex(doesNotContainMatch[1])}'`;
  }

  // Negative lookahead: does not equal
  const doesNotEqualMatch = regex.match(/^\^\(\?!(.+)\$\)$/);
  if (doesNotEqualMatch) {
    return `Does not equal '${unescapeRegex(doesNotEqualMatch[1])}'`;
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

  // Equals: ^value$
  const equalsMatch = regex.match(/^\^(.+)\$$/);
  if (equalsMatch) {
    return `Equals '${unescapeRegex(equalsMatch[1])}'`;
  }

  // Begins with: ^value
  const beginsWithMatch = regex.match(/^\^(.+)$/);
  if (beginsWithMatch) {
    return `Starts with '${unescapeRegex(beginsWithMatch[1])}'`;
  }

  // Ends with: value$
  const endsWithMatch = regex.match(/^(.+)\$$/);
  if (endsWithMatch) {
    return `Ends with '${unescapeRegex(endsWithMatch[1])}'`;
  }

  // Matches pattern (contains |)
  if (regex.includes('|')) {
    const parts = regex.split('|').map(unescapeRegex);
    return `Matches one of: ${parts.map(p => `'${p}'`).join(', ')}`;
  }

  // Default: contains
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
  // Extract and compare: (?:prefix)value(?:suffix)
  const extractAndCompareMatch = regex.match(/^\(\?:(.+?)\)(.+)\(\?:(.+)\)$/);
  if (extractAndCompareMatch) {
    return {
      operation: 'extract_and_compare',
      value: unescapeRegex(extractAndCompareMatch[2]),
      prefix: unescapeRegex(extractAndCompareMatch[1]),
      suffix: unescapeRegex(extractAndCompareMatch[3]),
    };
  }

  // Negative lookahead: does not contain
  const doesNotContainMatch = regex.match(/^\^\(\?!\.\*(.+)\)$/);
  if (doesNotContainMatch) {
    return { operation: 'does_not_contain', value: unescapeRegex(doesNotContainMatch[1]) };
  }

  // Negative lookahead: does not equal
  const doesNotEqualMatch = regex.match(/^\^\(\?!(.+)\$\)$/);
  if (doesNotEqualMatch) {
    return { operation: 'does_not_equal', value: unescapeRegex(doesNotEqualMatch[1]) };
  }

  // Equals: ^value$
  const equalsMatch = regex.match(/^\^(.+)\$$/);
  if (equalsMatch) {
    return { operation: 'equals', value: unescapeRegex(equalsMatch[1]) };
  }

  // Begins with: ^value
  const beginsWithMatch = regex.match(/^\^(.+)$/);
  if (beginsWithMatch) {
    return { operation: 'begins_with', value: unescapeRegex(beginsWithMatch[1]) };
  }

  // Ends with: value$
  const endsWithMatch = regex.match(/^(.+)\$$/);
  if (endsWithMatch) {
    return { operation: 'ends_with', value: unescapeRegex(endsWithMatch[1]) };
  }

  // Matches pattern (contains |)
  if (regex.includes('|')) {
    const values = regex.split('|').map(unescapeRegex);
    return { operation: 'matches_pattern', value: values[0], values };
  }

  // Default: contains
  return { operation: 'contains', value: unescapeRegex(regex) };
}

/**
 * Decomposes an extraction regex into structured operation + params.
 */
export function decomposeExtractionRegex(regex: string): {
  operation: ExtractionOperation;
  prefix?: string;
  suffix?: string;
  pattern?: string;
} {
  // Extract between: prefix(.*?)suffix
  const extractBetweenMatch = regex.match(/^(.+?)\(\.\*\?\)(.+)$/);
  if (extractBetweenMatch) {
    return {
      operation: 'extract_between',
      prefix: unescapeRegex(extractBetweenMatch[1]),
      suffix: unescapeRegex(extractBetweenMatch[2]),
    };
  }

  // Extract after: prefix(.*)
  const extractAfterMatch = regex.match(/^(.+)\(\.\*\)$/);
  if (extractAfterMatch) {
    return {
      operation: 'extract_after',
      prefix: unescapeRegex(extractAfterMatch[1]),
    };
  }

  // Extract before: (.*?)suffix
  const extractBeforeMatch = regex.match(/^\(\.\*\?\)(.+)$/);
  if (extractBeforeMatch) {
    return {
      operation: 'extract_before',
      suffix: unescapeRegex(extractBeforeMatch[1]),
    };
  }

  // Extract matching: (pattern)
  const extractMatchingMatch = regex.match(/^\((.+)\)$/);
  if (extractMatchingMatch) {
    return {
      operation: 'extract_matching',
      pattern: extractMatchingMatch[1],
    };
  }

  // Fallback
  return { operation: 'extract_matching', pattern: regex };
}
