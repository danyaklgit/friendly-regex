import { describe, it, expect } from 'vitest';
import { engregxify, decomposeRegex, decomposeExtractionRegex, describeLiteralBoundary } from './engregxify';
import { regexify } from './regexify';
import type { MatchOperation } from '../types';

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

  // Nullary operations — current regex shapes
  it('is blank or empty: ^[\\s-]*$ matches empty / whitespace / dash-only', () => {
    expect(engregxify('^[\\s-]*$')).toBe('Is blank or empty');
  });

  it('is not blank or empty: ^.*[^\\s-].*$ matches any non-blank, non-dash content', () => {
    expect(engregxify('^.*[^\\s-].*$')).toBe('Is not blank or empty');
  });

  // Legacy shapes (sentinel form + pure whitespace regex) still decode for
  // backward compat — any saved TagSpec library from prior frontend releases
  // carries these and should still surface the friendly label.
  it('legacy sentinel form still decodes (blank)', () => {
    expect(engregxify('__IS_BLANK_OR_EMPTY:')).toBe('Is blank or empty');
  });

  it('legacy sentinel form still decodes (not blank)', () => {
    expect(engregxify('__IS_NOT_BLANK_OR_EMPTY:')).toBe('Is not blank or empty');
  });

  it('legacy whitespace-only regex still decodes (blank)', () => {
    expect(engregxify('^\\s*$')).toBe('Is blank or empty');
  });

  it('legacy whitespace-only regex still decodes (not blank)', () => {
    expect(engregxify('^\\s*\\S[\\s\\S]*$')).toBe('Is not blank or empty');
  });

  // Round-trip: regexify → engregxify lands back on the friendly prompt.
  it('round-trips is_blank_or_empty via regexify', () => {
    expect(engregxify(regexify('is_blank_or_empty', ''))).toBe('Is blank or empty');
  });

  it('round-trips is_not_blank_or_empty via regexify', () => {
    expect(engregxify(regexify('is_not_blank_or_empty', ''))).toBe('Is not blank or empty');
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

  it('does not contain alt form: ^((?!REJ-/).)*$', () => {
    expect(engregxify('^((?!REJ-/).)*$')).toBe("Does not contain 'REJ-/'");
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

  it('does_not_contain alt form: ^((?!X).)*$', () => {
    expect(decomposeRegex('^((?!REJ-/).)*$')).toEqual({ operation: 'does_not_contain', value: 'REJ-/' });
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

  // ISO-date-tolerant end anchor `(T|$)` — produced by regexify when the
  // literal value matches YYYY-MM-DD. Decompose must recognize both shapes
  // so saved date rules round-trip back into the editor cleanly.
  describe('ISO-date end anchor round-trip', () => {
    it('equals with (T|$) anchor', () => {
      expect(decomposeRegex('^2024-01-29(T|$)')).toEqual({
        operation: 'equals',
        value: '2024-01-29',
      });
    });

    it('ends_with with (T|$) anchor', () => {
      expect(decomposeRegex('2024-01-29(T|$)')).toEqual({
        operation: 'ends_with',
        value: '2024-01-29',
      });
    });

    it('does_not_equal with (T|$) anchor inside lookahead', () => {
      expect(decomposeRegex('^(?!2024-01-29(T|$)).*$')).toEqual({
        operation: 'does_not_equal',
        value: '2024-01-29',
      });
    });

    it('does_not_end_with with (T|$) anchor inside lookahead', () => {
      expect(decomposeRegex('^(?!.*2024-01-29(T|$)).*$')).toEqual({
        operation: 'does_not_end_with',
        value: '2024-01-29',
      });
    });
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

  it('extract_last_n_chars round-trips from `(.{N})$`', () => {
    expect(decomposeExtractionRegex('(.{4})$')).toEqual({
      operation: 'extract_last_n_chars',
      numChars: 4,
    });
  });

  it('extract_last_n_chars with single-digit numChars', () => {
    expect(decomposeExtractionRegex('(.{12})$')).toEqual({
      operation: 'extract_last_n_chars',
      numChars: 12,
    });
  });

  it('does not misread `(.{N})` without end-anchor as extract_last_n_chars', () => {
    // No trailing `$` → falls through to extract_matching, preserving the
    // distinction between "last N chars" and "first N chars from start".
    expect(decomposeExtractionRegex('(.{4})')).toEqual({
      operation: 'extract_matching',
      pattern: '.{4}',
    });
  });

  it('extract_skip_take round-trips from `^.{n}(.{y})`', () => {
    expect(decomposeExtractionRegex('^.{40}(.{10})')).toEqual({
      operation: 'extract_skip_take',
      fromPosition: 40,
      numChars: 10,
    });
  });

  it('extract_skip_take round-trips from `^.{n}(.*)` as till-end-of-input', () => {
    expect(decomposeExtractionRegex('^.{40}(.*)')).toEqual({
      operation: 'extract_skip_take',
      fromPosition: 40,
      tillEndOfInput: true,
    });
  });

  it('extract_skip_take with a zero skip: `^(.{y})`', () => {
    expect(decomposeExtractionRegex('^(.{10})')).toEqual({
      operation: 'extract_skip_take',
      fromPosition: 0,
      numChars: 10,
    });
  });

  // Case A: ^(.*) and ^([\s\S]*)$ both collapse to extract_full_field — they
  // behave identically on single-line transaction text.
  it.each([
    '^(.*)',
    '^(.*)$',
    '^([\\s\\S]*)$',
    '^([\\s\\S]*)',
  ])('collapses %s to extract_full_field', (regex) => {
    expect(decomposeExtractionRegex(regex)).toEqual({
      operation: 'extract_full_field',
    });
  });

  // Case 1: the most common production shape (~373 rules) — split the
  // `(?:literal|$)` suffix into a literal + end-of-input flag.
  it('extract_between with end-of-input alternation', () => {
    expect(decomposeExtractionRegex('/ORDP/(.*?)(?:/|$)')).toEqual({
      operation: 'extract_between',
      prefix: '/ORDP/',
      suffix: '/',
      suffixOrEndOfInput: true,
    });
  });

  it('extract_before with end-of-input alternation', () => {
    expect(decomposeExtractionRegex('(.*?)(?:/END|$)')).toEqual({
      operation: 'extract_before',
      suffix: '/END',
      suffixOrEndOfInput: true,
    });
  });

  // Case B: lookarounds → matching pattern. Production examples:
  //   ^((?!Fee).)*$         (negative lookahead — does not contain)
  //   (?<=IBAN\/SA.{2})\d{2} (positive lookbehind — context-anchored)
  it.each([
    '^((?!Fee).)*$',
    '^(?!Internal\\ Accounts\\ Transfer)',
    '(?<=IBAN\\/SA.{2})\\d{2}',
    '(?=foo)\\d+',
    '(?<!USD)$',
  ])('forces lookaround pattern %s to extract_matching', (regex) => {
    expect(decomposeExtractionRegex(regex)).toEqual({
      operation: 'extract_matching',
      pattern: regex,
    });
  });

  // Case D: multi-token alternation prefix → matching pattern (~8 rules).
  it('forces leading multi-alternation to extract_matching', () => {
    const regex = '(?:Due\\ To\\ :|Due\\ To|Due)\\s*(.*?)(?:\\s*Transaction\\ Currency\\ :|$)';
    expect(decomposeExtractionRegex(regex)).toEqual({
      operation: 'extract_matching',
      pattern: regex,
    });
  });

  // Defensive guarantee: if the decomposed prefix/suffix would still contain
  // regex syntax, fall back to extract_matching rather than leaking syntax
  // into the structured fields.
  it('falls back to matching when suffix still looks like regex', () => {
    const regex = '/TOKEN/(.*?).+';
    expect(decomposeExtractionRegex(regex)).toEqual({
      operation: 'extract_matching',
      pattern: regex,
    });
  });

  it('fallback for unrecognized pattern', () => {
    expect(decomposeExtractionRegex('plain')).toEqual({
      operation: 'extract_matching',
      pattern: 'plain',
    });
  });
});

describe('describeLiteralBoundary', () => {
  it('reports empty prefix', () => {
    expect(describeLiteralBoundary('', 'prefix')).toBe(
      'Empty — extraction starts at the beginning of the source field.',
    );
  });

  it('reports empty suffix', () => {
    expect(describeLiteralBoundary('', 'suffix')).toBe(
      'Empty — extraction continues to the end of the source field.',
    );
  });

  it('describes a plain literal prefix', () => {
    expect(describeLiteralBoundary('/ORDP/', 'prefix')).toBe(
      'Looks for the literal text "/ORDP/". Extraction starts after this text.',
    );
  });

  it('describes a plain literal suffix', () => {
    expect(describeLiteralBoundary('/END', 'suffix')).toBe(
      'Looks for the literal text "/END". Extraction stops before this text.',
    );
  });

  it('treats whitespace-only values as visible literals', () => {
    expect(describeLiteralBoundary(' ', 'suffix')).toBe(
      'Looks for the literal text " ". Extraction stops before this text.',
    );
  });

  it('describes alternation with end-of-input anchor as suffix', () => {
    expect(describeLiteralBoundary('(?:/|$)', 'suffix')).toBe(
      'Looks for "/" or end of input. Extraction stops before this match.',
    );
  });

  it('describes alternation with multiple literal branches', () => {
    expect(describeLiteralBoundary('(?:/|;|\\|)', 'suffix')).toBe(
      'Looks for "/" or ";" or "|". Extraction stops before this match.',
    );
  });

  it('describes shorthand digit class', () => {
    expect(describeLiteralBoundary('\\d+', 'prefix')).toBe(
      'Looks for one or more digits. Extraction starts after this match.',
    );
  });

  it('describes fixed-count digit class', () => {
    expect(describeLiteralBoundary('\\d{4}', 'prefix')).toBe(
      'Looks for 4 digits. Extraction starts after this match.',
    );
  });

  it('narrates compositions of anchors, literals, and char classes', () => {
    expect(describeLiteralBoundary('^TNXT[A-Z]+', 'prefix')).toBe(
      'Looks for start of input, then "TNXT", then one or more uppercase letters. Extraction starts after this match.',
    );
  });

  it('defaults role to prefix when not specified', () => {
    expect(describeLiteralBoundary('/X/')).toContain('Extraction starts after');
  });

  // ── pattern role (extract_matching) ──
  it('describes empty pattern', () => {
    expect(describeLiteralBoundary('', 'pattern')).toBe('Empty — no pattern set.');
  });

  it('describes a literal pattern', () => {
    expect(describeLiteralBoundary('PAYMENT', 'pattern')).toBe(
      'Looks for the literal text "PAYMENT". The matched text is extracted.',
    );
  });

  it('describes a digit-shorthand pattern', () => {
    expect(describeLiteralBoundary('\\d{2}', 'pattern')).toBe(
      'Matches 2 digits. The matched text is extracted.',
    );
  });

  it('describes alternation in pattern role', () => {
    expect(describeLiteralBoundary('(?:USD|EUR|SAR)', 'pattern')).toBe(
      'Matches "USD" or "EUR" or "SAR". The matched text is extracted.',
    );
  });

  it('narrates a lookbehind followed by a digit class', () => {
    expect(describeLiteralBoundary('(?<=IBAN/SA.{2})\\d{2}', 'pattern')).toBe(
      'Matches 2 digits (preceded by "IBAN/SA", then 2 characters). The matched text is extracted.',
    );
  });

  it('narrates a sequence of literal, shorthand, and capturing group', () => {
    expect(describeLiteralBoundary('IBAN/SA\\d{2}(.{2})', 'pattern')).toBe(
      'Matches "IBAN/SA", then 2 digits, then 2 characters. The matched text is extracted.',
    );
  });

  it('narrates a date-style lookbehind with literal-list and range char classes', () => {
    expect(describeLiteralBoundary('(?<=20\\d{2}[01][0-9][0-3][0-9]SA)(.{4})', 'pattern')).toBe(
      'Matches 4 characters (preceded by "20", then 2 digits, then "0" or "1", then a digit, then a digit from 0 to 3, then a digit, then "SA"). The matched text is extracted.',
    );
  });

  it('narrates a negative lookahead', () => {
    expect(describeLiteralBoundary('\\d+(?!USD)', 'pattern')).toBe(
      'Matches one or more digits (not followed by "USD"). The matched text is extracted.',
    );
  });
});

// Round-trip: every operation that regexify can produce must decompose
// back into the same operation + value. Inputs come straight from regexify
// (no hardcoded regex strings) so the test stays in sync if the canonical
// form ever changes.
describe('regexify ↔ decomposeRegex round-trip', () => {
  const cases: Array<{ operation: MatchOperation; value: string }> = [
    { operation: 'begins_with', value: 'PT/SARIE' },
    { operation: 'ends_with', value: 'XYZ' },
    { operation: 'contains', value: 'TRANSFER' },
    { operation: 'equals', value: 'EXACT' },
    { operation: 'does_not_contain', value: 'REJ-/' },
    { operation: 'does_not_equal', value: 'BAD' },
    { operation: 'does_not_start_with', value: 'CFT' },
    { operation: 'does_not_end_with', value: 'USD' },
  ];

  for (const { operation, value } of cases) {
    it(`${operation} round-trips through regexify → decomposeRegex`, () => {
      const regex = regexify(operation, value);
      const decomposed = decomposeRegex(regex);
      expect(decomposed.operation).toBe(operation);
      expect(decomposed.value).toBe(value);
    });
  }
});
