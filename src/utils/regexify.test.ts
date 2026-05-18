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

  // Date-shaped values get an ISO-date-tolerant end anchor `(T|$)` so the
  // server-side regex match still hits rows whose date column stores a full
  // ISO timestamp (2024-01-29T00:00:00Z). Non-date values keep the plain `$`.
  describe('ISO-date end anchor', () => {
    it('equals emits (T|$) for a bare date value', () => {
      expect(regexify('equals', '2024-01-29')).toBe('^2024-01-29(T|$)');
    });

    it('equals still emits plain $ for non-date values', () => {
      expect(regexify('equals', '2024-AB-29')).toBe('^2024-AB-29$');
      expect(regexify('equals', '20240129')).toBe('^20240129$');
    });

    it('ends_with emits (T|$) for a bare date value', () => {
      expect(regexify('ends_with', '2024-01-29')).toBe('2024-01-29(T|$)');
    });

    it('does_not_equal emits the tolerant anchor inside the negative lookahead', () => {
      expect(regexify('does_not_equal', '2024-01-29'))
        .toBe('^(?!2024-01-29(T|$)).*$');
    });

    it('does_not_end_with emits the tolerant anchor inside the negative lookahead', () => {
      expect(regexify('does_not_end_with', '2024-01-29'))
        .toBe('^(?!.*2024-01-29(T|$)).*$');
    });

    it('matches_pattern uses (T|$) only when EVERY value is date-shaped', () => {
      expect(regexify('matches_pattern', '', ['2024-01-29', '2024-01-30']))
        .toBe('^(2024-01-29|2024-01-30)(T|$)');
    });

    it('matches_pattern falls back to plain $ when any value is not date-shaped', () => {
      expect(regexify('matches_pattern', '', ['2024-01-29', 'CODE']))
        .toBe('^(2024-01-29|CODE)$');
    });
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

  it('extract_matching: does not wrap when pattern already has a capture group', () => {
    // User supplies their own `(.{2})` — the outer wrapper would bump group 1
    // to the full match, diverging from the backend.
    expect(regexifyExtraction('extract_matching', { pattern: 'IBAN/SA\\d{2}(.{2})' }))
      .toBe('IBAN/SA\\d{2}(.{2})');
  });

  it('extract_matching: treats non-capturing/lookaround groups as not captures', () => {
    expect(regexifyExtraction('extract_matching', { pattern: '(?:foo)\\d+' }))
      .toBe('((?:foo)\\d+)');
    expect(regexifyExtraction('extract_matching', { pattern: '(?=foo)\\d+' }))
      .toBe('((?=foo)\\d+)');
  });

  it('extract_matching: ignores escaped parens and parens inside character classes', () => {
    expect(regexifyExtraction('extract_matching', { pattern: '\\(\\d+\\)' }))
      .toBe('(\\(\\d+\\))');
    expect(regexifyExtraction('extract_matching', { pattern: '[()]+' }))
      .toBe('([()]+)');
  });

  it('extract_full_field: anchored capture-all (handles newlines)', () => {
    expect(regexifyExtraction('extract_full_field', {}))
      .toBe('^([\\s\\S]*)$');
  });

  it('extract_between with suffixOrEndOfInput emits `(?:<suffix>|$)`', () => {
    // The dominant production shape: 373 rules in the seed file use this.
    expect(regexifyExtraction('extract_between', {
      prefix: '/ORDP/', suffix: '/', suffixOrEndOfInput: true,
    })).toBe('/ORDP/(.*?)(?:/|$)');
  });

  it('extract_between with suffixOrEndOfInput escapes regex metacharacters in the suffix', () => {
    // Literal `.` should reach the regex as `\.`, not match-any.
    expect(regexifyExtraction('extract_between', {
      prefix: 'REF', suffix: '.', suffixOrEndOfInput: true,
    })).toBe('REF(.*?)(?:\\.|$)');
  });

  it('extract_between with empty suffix + flag degrades to bare `$`', () => {
    expect(regexifyExtraction('extract_between', {
      prefix: 'REF', suffix: '', suffixOrEndOfInput: true,
    })).toBe('REF(.*?)$');
  });

  it('extract_before with suffixOrEndOfInput emits `(?:<suffix>|$)`', () => {
    expect(regexifyExtraction('extract_before', {
      suffix: '/END', suffixOrEndOfInput: true,
    })).toBe('(.*?)(?:/END|$)');
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

  it('lov-prefixed operation: returns the regex carried in the key when it already has a capture group', () => {
    // LOV-driven extractions encode the regex as `lov:<regex>`; the pure util
    // has no catalog access, so the operation key itself carries the payload.
    // When the LOV entry already exposes a capture group, the regex passes
    // through verbatim (no double-wrapping).
    expect(regexifyExtraction('lov:(SA\\d{2}[A-Z0-9]{18})', {}))
      .toBe('(SA\\d{2}[A-Z0-9]{18})');
  });

  it('lov-prefixed operation: ignores all params (no prefix/suffix/pattern fields)', () => {
    // The SWIFT/BIC regex already carries a capture group, so it round-trips
    // through `lov:` without further wrapping.
    expect(regexifyExtraction('lov:^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$', {
      prefix: 'IGNORED',
      suffix: 'IGNORED',
      pattern: 'IGNORED',
      numChars: 5,
    })).toBe('^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$');
  });

  it('lov-prefixed operation: wraps an anchored validation regex, keeping `^` and dropping `$`', () => {
    // Validation-style LOV entry (no capture group) — needs wrapping so the
    // server has something to lift out. The trailing `$` is dropped because
    // LOV regexes are validation-shaped but we're using them for extraction
    // (longer fields shouldn't block the lift).
    expect(regexifyExtraction('lov:^SA\\d{2}[A-Z0-9]{18}$', {}))
      .toBe('^(SA\\d{2}[A-Z0-9]{18})');
  });

  it('lov-prefixed operation: drops a lone trailing `$` and wraps with a capture group', () => {
    expect(regexifyExtraction('lov:[12]\\d{9}$', {}))
      .toBe('([12]\\d{9})');
  });

  it('lov-prefixed operation: wraps an unanchored validation regex with a capture around the whole pattern', () => {
    expect(regexifyExtraction('lov:[12]\\d{9}', {}))
      .toBe('([12]\\d{9})');
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
    expect(generateExpressionPrompt('begins_with', 'ABC')).toBe("Starts with 'ABC'");
  });

  it('ends_with', () => {
    expect(generateExpressionPrompt('ends_with', 'XYZ')).toBe("Ends with 'XYZ'");
  });

  it('contains', () => {
    expect(generateExpressionPrompt('contains', 'PAY')).toBe("Contains 'PAY'");
  });

  it('does_not_contain', () => {
    expect(generateExpressionPrompt('does_not_contain', 'X')).toBe("Does not contain 'X'");
  });

  it('equals', () => {
    expect(generateExpressionPrompt('equals', 'EXACT')).toBe("Equals 'EXACT'");
  });

  it('does_not_equal', () => {
    expect(generateExpressionPrompt('does_not_equal', 'BAD')).toBe("Does not equal 'BAD'");
  });

  it('matches_pattern with values', () => {
    expect(generateExpressionPrompt('matches_pattern', '', ['A', 'B']))
      .toBe("Matches one of: 'A', 'B'");
  });

  it('matches_pattern falls back to value', () => {
    expect(generateExpressionPrompt('matches_pattern', 'A'))
      .toBe("Matches one of: 'A'");
  });

  it('match_regex', () => {
    expect(generateExpressionPrompt('match_regex', '\\d+')).toBe("Matches pattern '\\d+'");
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

  it('extract_full_field', () => {
    expect(generateExtractionPrompt('extract_full_field', {})).toBe('Extract full field');
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

  it('lov-prefixed operation falls back to a regex-anchored description', () => {
    // The pure util has no LOV catalog so it can't surface the friendly Name;
    // UI consumers override this with the LOV's label.
    expect(generateExtractionPrompt('lov:^SA\\d{22}$', {}))
      .toBe("Match pattern '^SA\\d{22}$'");
  });
});
