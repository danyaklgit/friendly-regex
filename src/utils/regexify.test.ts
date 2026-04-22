import { describe, it, expect } from 'vitest';
import { regexify, regexifyExtraction, generateExpressionPrompt, generateExtractionPrompt } from './regexify';

describe('regexify', () => {
  it('begins_with: anchors at start', () => {
    expect(regexify('begins_with', 'TNXT')).toBe('^TNXT');
  });

  it('ends_with: anchors at end', () => {
    expect(regexify('ends_with', 'USD')).toBe('USD$');
  });

  it('contains: returns escaped value', () => {
    expect(regexify('contains', 'PAYMENT')).toBe('PAYMENT');
  });

  it('does_not_contain: negative lookahead anchored to the full string', () => {
    expect(regexify('does_not_contain', 'VOID')).toBe('^(?!.*VOID).*$');
  });

  it('equals: anchored both ends', () => {
    expect(regexify('equals', 'EXACT')).toBe('^EXACT$');
  });

  it('does_not_equal: anchored negative lookahead over the whole string', () => {
    expect(regexify('does_not_equal', 'BAD')).toBe('^(?!BAD$).*$');
  });

  it('matches_pattern: anchored alternation of escaped values', () => {
    expect(regexify('matches_pattern', '', ['USD', 'EUR', 'SAR'])).toBe('^(USD|EUR|SAR)$');
  });

  it('matches_pattern: falls back to single value, still anchored', () => {
    expect(regexify('matches_pattern', 'USD')).toBe('^(USD)$');
  });

  it('match_regex: passes through raw regex', () => {
    expect(regexify('match_regex', '\\d{3}')).toBe('\\d{3}');
  });

  it('does_not_start_with: anchored negative lookahead at start', () => {
    expect(regexify('does_not_start_with', 'CFT')).toBe('^(?!CFT).*$');
  });

  it('does_not_end_with: anchored negative lookahead instead of lookbehind', () => {
    expect(regexify('does_not_end_with', 'USD')).toBe('^(?!.*USD$).*$');
  });

  it('greater_than: numeric prefix', () => {
    expect(regexify('greater_than', '500')).toBe('__NUMERIC_GT:500');
  });

  it('less_than: numeric prefix', () => {
    expect(regexify('less_than', '100')).toBe('__NUMERIC_LT:100');
  });

  it('greater_than_or_equal: numeric prefix', () => {
    expect(regexify('greater_than_or_equal', '0')).toBe('__NUMERIC_GTE:0');
  });

  it('less_than_or_equal: numeric prefix', () => {
    expect(regexify('less_than_or_equal', '999')).toBe('__NUMERIC_LTE:999');
  });

  it('does not escape forward slash (not a regex metachar)', () => {
    expect(regexify('contains', 'USD/SAR')).toBe('USD/SAR');
  });

  it('escapes special characters in begins_with', () => {
    expect(regexify('begins_with', 'A.B')).toBe('^A\\.B');
  });

  it('default case returns escaped value', () => {
    // Force an unknown operation through the default branch
    expect(regexify('unknown_op' as any, 'test')).toBe('test');
  });
});

describe('regexifyExtraction', () => {
  it('extract_between: prefix(.*?)suffix', () => {
    expect(regexifyExtraction('extract_between', { prefix: '/ORDP/', suffix: '/' }))
      .toBe('/ORDP/(.*?)/');
  });

  it('extract_after: default captures everything after the prefix', () => {
    expect(regexifyExtraction('extract_after', { prefix: 'REF:' }))
      .toBe('REF:(.*)');
  });

  it('extract_after: captures up to the first toStr occurrence when provided', () => {
    expect(regexifyExtraction('extract_after', { prefix: 'REF:', toStr: ' ' }))
      .toBe('REF:(.*?) ');
  });

  it('extract_before: default captures everything before the suffix', () => {
    expect(regexifyExtraction('extract_before', { suffix: 'Bill for' }))
      .toBe('(.*?)Bill for');
  });

  it('extract_before: with toStr anchors to the LAST toStr before the suffix', () => {
    // "...NAR3/2 /EXCH/1..." with suffix="/1" and toStr=" " should capture "/EXCH",
    // not everything from the first space onwards.
    expect(regexifyExtraction('extract_before', { suffix: '/1', toStr: ' ' }))
      .toBe('.* (.*?)/1');
  });

  it('extract_before: with numChars captures fixed-length window before the suffix', () => {
    expect(regexifyExtraction('extract_before', { suffix: '/1', numChars: 5 }))
      .toBe('(.{5})/1');
  });

  it('extract_matching: wraps pattern in group', () => {
    expect(regexifyExtraction('extract_matching', { pattern: '\\d+' }))
      .toBe('(\\d+)');
  });

  it('extract_matching: defaults to (.*) when no pattern', () => {
    expect(regexifyExtraction('extract_matching', {}))
      .toBe('(.*)');
  });

  it('extract_between_and_verify: same as extract_between', () => {
    expect(regexifyExtraction('extract_between_and_verify', { prefix: 'A', suffix: 'B' }))
      .toBe('A(.*?)B');
  });

  it('predefined pattern: returns regex from PREDEFINED_PATTERNS', () => {
    expect(regexifyExtraction('predefined:ksa_iban', {}))
      .toBe('(SA\\d{22})');
  });

  it('unknown predefined pattern: falls back to (.*)', () => {
    expect(regexifyExtraction('predefined:nonexistent' as any, {}))
      .toBe('(.*)');
  });

  it('default case returns (.*)', () => {
    expect(regexifyExtraction('unknown' as any, {}))
      .toBe('(.*)');
  });

  it('extract_between with missing prefix/suffix defaults to empty', () => {
    expect(regexifyExtraction('extract_between', {}))
      .toBe('(.*?)');
  });

  it('extract_after with missing prefix captures the entire string', () => {
    expect(regexifyExtraction('extract_after', {}))
      .toBe('(.*)');
  });

  it('extract_before with missing suffix defaults to lazy capture', () => {
    expect(regexifyExtraction('extract_before', {}))
      .toBe('(.*?)');
  });

  it('extract_between_and_verify with missing prefix/suffix defaults to empty', () => {
    expect(regexifyExtraction('extract_between_and_verify', {}))
      .toBe('(.*?)');
  });

  it('extract_substring: from position only', () => {
    expect(regexifyExtraction('extract_substring', { fromPosition: 5 }))
      .toBe('.{5}(.*)');
  });

  it('extract_substring: from position with numChars', () => {
    expect(regexifyExtraction('extract_substring', { fromPosition: 2, numChars: 10 }))
      .toBe('.{2}(.{10})');
  });

  it('extract_substring: from position with toStr', () => {
    expect(regexifyExtraction('extract_substring', { fromPosition: 3, toStr: 'END' }))
      .toBe('.{3}(.*?)END');
  });

  it('extract_substring: no position defaults to capturing from start', () => {
    expect(regexifyExtraction('extract_substring', {}))
      .toBe('(.*)');
  });

  it('extract_substring: toStart with fromPosition captures first N chars', () => {
    expect(regexifyExtraction('extract_substring', { toStart: true, fromPosition: 8 }))
      .toBe('(.{8})');
  });
});

describe('generateExpressionPrompt', () => {
  it('begins_with', () => {
    expect(generateExpressionPrompt('begins_with', 'ABC')).toBe("Start with 'ABC'");
  });

  it('ends_with', () => {
    expect(generateExpressionPrompt('ends_with', 'XYZ')).toBe("End with 'XYZ'");
  });

  it('contains', () => {
    expect(generateExpressionPrompt('contains', 'PAY')).toBe("Contain 'PAY'");
  });

  it('does_not_contain', () => {
    expect(generateExpressionPrompt('does_not_contain', 'X')).toBe("Not contain 'X'");
  });

  it('equals', () => {
    expect(generateExpressionPrompt('equals', 'EXACT')).toBe("Equal 'EXACT'");
  });

  it('does_not_equal', () => {
    expect(generateExpressionPrompt('does_not_equal', 'BAD')).toBe("Not equal 'BAD'");
  });

  it('matches_pattern with values', () => {
    expect(generateExpressionPrompt('matches_pattern', '', ['A', 'B']))
      .toBe("Match one of: 'A', 'B'");
  });

  it('matches_pattern falls back to value', () => {
    expect(generateExpressionPrompt('matches_pattern', 'A'))
      .toBe("Match one of: 'A'");
  });

  it('match_regex', () => {
    expect(generateExpressionPrompt('match_regex', '\\d+')).toBe("Match pattern '\\d+'");
  });

  it('does_not_start_with', () => {
    expect(generateExpressionPrompt('does_not_start_with', 'CFT'))
      .toBe("Does not start with 'CFT'");
  });

  it('does_not_end_with', () => {
    expect(generateExpressionPrompt('does_not_end_with', 'USD'))
      .toBe("Does not end with 'USD'");
  });

  it('greater_than', () => {
    expect(generateExpressionPrompt('greater_than', '500')).toBe("Greater than '500'");
  });

  it('less_than', () => {
    expect(generateExpressionPrompt('less_than', '100')).toBe("Less than '100'");
  });

  it('greater_than_or_equal', () => {
    expect(generateExpressionPrompt('greater_than_or_equal', '0')).toBe("Greater than or equal to '0'");
  });

  it('less_than_or_equal', () => {
    expect(generateExpressionPrompt('less_than_or_equal', '999')).toBe("Less than or equal to '999'");
  });

  it('default returns value', () => {
    expect(generateExpressionPrompt('unknown' as any, 'fallback')).toBe('fallback');
  });

});

describe('generateExtractionPrompt', () => {
  it('extract_between', () => {
    expect(generateExtractionPrompt('extract_between', { prefix: 'A', suffix: 'B' }))
      .toBe("Extract between 'A' and 'B'");
  });

  it('extract_after', () => {
    expect(generateExtractionPrompt('extract_after', { prefix: 'REF:' }))
      .toBe("Extract after 'REF:'");
  });

  it('extract_before', () => {
    expect(generateExtractionPrompt('extract_before', { suffix: '/END' }))
      .toBe("Extract before '/END'");
  });

  it('extract_matching', () => {
    expect(generateExtractionPrompt('extract_matching', { pattern: '\\d+' }))
      .toBe("Extract matching '\\d+'");
  });

  it('extract_between_and_verify', () => {
    expect(generateExtractionPrompt('extract_between_and_verify', { prefix: 'A', suffix: 'B', verifyValue: 'V' }))
      .toBe("Extract between 'A' and 'B', verify = 'V'");
  });

  it('predefined pattern', () => {
    expect(generateExtractionPrompt('predefined:ksa_iban', {}))
      .toBe('Match Verify KSA IBAN');
  });

  it('unknown predefined returns Extract value', () => {
    expect(generateExtractionPrompt('predefined:nonexistent' as any, {}))
      .toBe('Extract value');
  });

  it('default returns Extract value', () => {
    expect(generateExtractionPrompt('unknown' as any, {}))
      .toBe('Extract value');
  });

  it('extract_substring with all params', () => {
    expect(generateExtractionPrompt('extract_substring', { fromPosition: 5, numChars: 10, toStr: 'END' }))
      .toBe("Sub-string (from position 5, 10 chars, to 'END')");
  });

  it('extract_substring with position only', () => {
    expect(generateExtractionPrompt('extract_substring', { fromPosition: 3 }))
      .toBe('Sub-string (from position 3)');
  });

  it('extract_substring with no params', () => {
    expect(generateExtractionPrompt('extract_substring', {}))
      .toBe('Sub-string');
  });

  it('extract_between with missing prefix/suffix defaults to empty strings', () => {
    expect(generateExtractionPrompt('extract_between', {}))
      .toBe("Extract between '' and ''");
  });

  it('extract_after with missing prefix defaults to empty string', () => {
    expect(generateExtractionPrompt('extract_after', {}))
      .toBe("Extract after ''");
  });

  it('extract_before with missing suffix defaults to empty string', () => {
    expect(generateExtractionPrompt('extract_before', {}))
      .toBe("Extract before ''");
  });

  it('extract_matching with missing pattern defaults to empty string', () => {
    expect(generateExtractionPrompt('extract_matching', {}))
      .toBe("Extract matching ''");
  });

  it('extract_between_and_verify with missing params defaults to empty strings', () => {
    expect(generateExtractionPrompt('extract_between_and_verify', {}))
      .toBe("Extract between '' and '', verify = ''");
  });
});
