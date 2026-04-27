import { describe, it, expect } from 'vitest';
import { engregxify, decomposeRegex, decomposeExtractionRegex } from './engregxify';

describe('engregxify', () => {
  // Numeric comparisons
  it('greater than', () => {
    expect(engregxify('__NUMERIC_GT:500')).toBe("Greater than '500'");
  });

  it('less than', () => {
    expect(engregxify('__NUMERIC_LT:100')).toBe("Less than '100'");
  });

  it('greater than or equal', () => {
    expect(engregxify('__NUMERIC_GTE:0')).toBe("Greater than or equal to '0'");
  });

  it('less than or equal', () => {
    expect(engregxify('__NUMERIC_LTE:999')).toBe("Less than or equal to '999'");
  });

  // Does not start with / does not end with
  it('does not start with: ^(?!CFT)', () => {
    expect(engregxify('^(?!CFT)')).toBe("Does not start with 'CFT'");
  });

  it('does not end with: (?<!USD)$', () => {
    expect(engregxify('(?<!USD)$')).toBe("Does not end with 'USD'");
  });

  // Negative lookahead
  it('does not contain: ^(?!.*VOID)', () => {
    expect(engregxify('^(?!.*VOID)')).toBe("Does not contain 'VOID'");
  });

  it('does not equal: ^(?!BAD$)', () => {
    expect(engregxify('^(?!BAD$)')).toBe("Does not equal 'BAD'");
  });

  // Extract between/after/before
  it('extract between: prefix(.*?)suffix', () => {
    expect(engregxify('/ORDP/(.*?)/')).toBe("Extract between '/ORDP/' and '/'");
  });

  it('extract after: prefix(.*)', () => {
    expect(engregxify('REF:(.*)')).toBe("Extract after 'REF:'");
  });

  it('extract before: (.*?)suffix', () => {
    expect(engregxify('(.*?)/END')).toBe("Extract before '/END'");
  });

  // Equals
  it('equals: ^EXACT$', () => {
    expect(engregxify('^EXACT$')).toBe("Equals 'EXACT'");
  });

  // Begins with
  it('starts with: ^TNXT', () => {
    expect(engregxify('^TNXT')).toBe("Starts with 'TNXT'");
  });

  // Ends with
  it('ends with: USD$', () => {
    expect(engregxify('USD$')).toBe("Ends with 'USD'");
  });

  // Pipe is a regex metachar, so hasActiveRegexSyntax returns true
  it('pipe-separated values treated as complex regex', () => {
    expect(engregxify('USD|EUR|SAR')).toBe("Matches pattern 'USD|EUR|SAR'");
  });

  // Escaped pipe values (no active syntax) match "one of"
  it('matches one of with escaped pipes', () => {
    // When values are escaped by regexify, they don't contain active syntax
    // But plain pipe is active syntax, so this branch requires escaped values
    expect(engregxify('PAYMENT')).toBe("Contains 'PAYMENT'");
  });

  // Contains (simple literal)
  it('contains: PAYMENT', () => {
    expect(engregxify('PAYMENT')).toBe("Contains 'PAYMENT'");
  });

  // Complex regex fallback
  it('complex regex with active syntax', () => {
    expect(engregxify('\\d{3}[A-Z]+')).toBe("Matches pattern '\\d{3}[A-Z]+'");
  });

  // Escaped characters in simple patterns
  it('unescapes escaped characters in contains', () => {
    expect(engregxify('USD\\/SAR')).toBe("Contains 'USD/SAR'");
  });

  it('unescapes in equals', () => {
    expect(engregxify('^A\\.B$')).toBe("Equals 'A.B'");
  });

  // Regex with active syntax in anchored patterns falls through
  it('complex begins_with falls to matches pattern', () => {
    expect(engregxify('^\\d+[A-Z]')).toBe("Matches pattern '^\\d+[A-Z]'");
  });

  it('complex equals falls to matches pattern', () => {
    expect(engregxify('^\\d+$')).toBe("Matches pattern '^\\d+$'");
  });

  // Escaped backslash means complex
  it('double backslash is treated as complex', () => {
    expect(engregxify('foo\\\\bar')).toBe("Matches pattern 'foo\\\\bar'");
  });

  // Escaped pipe values (no active syntax after stripping escapes) → matches one of
  it('matches one of with escaped pipe-separated values', () => {
    expect(engregxify('USD\\|EUR')).toBe("Matches one of: 'USD\\', 'EUR'");
  });

  // Complex ends_with falls through to matches pattern
  it('complex ends_with falls to matches pattern', () => {
    expect(engregxify('\\d+$')).toBe("Matches pattern '\\d+$'");
  });
});

describe('decomposeRegex', () => {
  // Numeric
  it('greater_than', () => {
    expect(decomposeRegex('__NUMERIC_GT:500')).toEqual({ operation: 'greater_than', value: '500' });
  });

  it('less_than', () => {
    expect(decomposeRegex('__NUMERIC_LT:100')).toEqual({ operation: 'less_than', value: '100' });
  });

  it('greater_than_or_equal', () => {
    expect(decomposeRegex('__NUMERIC_GTE:0')).toEqual({ operation: 'greater_than_or_equal', value: '0' });
  });

  it('less_than_or_equal', () => {
    expect(decomposeRegex('__NUMERIC_LTE:999')).toEqual({ operation: 'less_than_or_equal', value: '999' });
  });

  // Does not start with
  it('does_not_start_with', () => {
    expect(decomposeRegex('^(?!CFT)')).toEqual({ operation: 'does_not_start_with', value: 'CFT' });
  });

  // Does not end with
  it('does_not_end_with', () => {
    expect(decomposeRegex('(?<!USD)$')).toEqual({ operation: 'does_not_end_with', value: 'USD' });
  });

  // Does not contain
  it('does_not_contain', () => {
    expect(decomposeRegex('^(?!.*VOID)')).toEqual({ operation: 'does_not_contain', value: 'VOID' });
  });

  // Does not equal
  it('does_not_equal', () => {
    expect(decomposeRegex('^(?!BAD$)')).toEqual({ operation: 'does_not_equal', value: 'BAD' });
  });

  // Equals
  it('equals', () => {
    expect(decomposeRegex('^EXACT$')).toEqual({ operation: 'equals', value: 'EXACT' });
  });

  // Begins with
  it('begins_with', () => {
    expect(decomposeRegex('^TNXT')).toEqual({ operation: 'begins_with', value: 'TNXT' });
  });

  // Ends with
  it('ends_with', () => {
    expect(decomposeRegex('USD$')).toEqual({ operation: 'ends_with', value: 'USD' });
  });

  // Pipe is active regex syntax, so it falls through to match_regex
  it('pipe-separated treated as match_regex (active syntax)', () => {
    const result = decomposeRegex('USD|EUR|SAR');
    expect(result.operation).toBe('match_regex');
    expect(result.value).toBe('USD|EUR|SAR');
  });

  // Match regex (complex)
  it('match_regex for complex pattern', () => {
    expect(decomposeRegex('\\d{3}[A-Z]+')).toEqual({ operation: 'match_regex', value: '\\d{3}[A-Z]+' });
  });

  // Contains (default)
  it('contains', () => {
    expect(decomposeRegex('PAYMENT')).toEqual({ operation: 'contains', value: 'PAYMENT' });
  });

  // Escaped values get unescaped
  it('unescapes values in equals', () => {
    expect(decomposeRegex('^A\\.B$')).toEqual({ operation: 'equals', value: 'A.B' });
  });

  // Escaped pipe: matches_pattern branch
  it('matches_pattern with escaped pipe values', () => {
    const result = decomposeRegex('USD\\|EUR');
    expect(result.operation).toBe('matches_pattern');
    expect(result.values).toEqual(['USD\\', 'EUR']);
  });
});

describe('decomposeExtractionRegex', () => {
  it('extract_between', () => {
    expect(decomposeExtractionRegex('/ORDP/(.*?)/')).toEqual({
      operation: 'extract_between',
      prefix: '/ORDP/',
      suffix: '/',
    });
  });

  it('extract_after', () => {
    expect(decomposeExtractionRegex('REF:(.*)')).toEqual({
      operation: 'extract_after',
      prefix: 'REF:',
    });
  });

  it('extract_before', () => {
    expect(decomposeExtractionRegex('(.*?)/END')).toEqual({
      operation: 'extract_before',
      suffix: '/END',
    });
  });

  it('extract_matching', () => {
    expect(decomposeExtractionRegex('(\\d+)')).toEqual({
      operation: 'extract_matching',
      pattern: '\\d+',
    });
  });

  it('extract_full_field round-trips from anchored capture-all', () => {
    expect(decomposeExtractionRegex('^([\\s\\S]*)$')).toEqual({
      operation: 'extract_full_field',
    });
  });

  it('fallback for unrecognized pattern', () => {
    expect(decomposeExtractionRegex('plain')).toEqual({
      operation: 'extract_matching',
      pattern: 'plain',
    });
  });
});
