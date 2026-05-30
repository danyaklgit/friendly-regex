import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redact, redactSegments } from './redact';
import type { RedactionRule } from '../../data/redactionRules';

describe('redact', () => {
  it('returns the input unchanged when no rules apply', () => {
    expect(redact('hello world', [])).toBe('hello world');
  });

  it('returns empty string for empty input', () => {
    expect(redact('', [{ kind: 'regex', name: 'x', pattern: '.', replacement: '*' }])).toBe('');
  });

  it('replaces a BETWEEN span including its delimiters', () => {
    const rule: RedactionRule = {
      kind: 'between',
      name: 'ORDP',
      prefix: '/ORDP/',
      suffix: '/',
      replacement: '*****OrderingPty*****',
    };
    expect(redact('header /ORDP/Acme Ltd/ tail', [rule])).toBe('header *****OrderingPty***** tail');
  });

  it('handles multiple BETWEEN spans in one pass (g flag)', () => {
    const rule: RedactionRule = {
      kind: 'between',
      name: 'X',
      prefix: '/X/',
      suffix: '/',
      replacement: '[redacted]',
    };
    expect(redact('/X/a/ and /X/b/', [rule])).toBe('[redacted] and [redacted]');
  });

  it('BETWEEN is non-greedy across the cell', () => {
    const rule: RedactionRule = {
      kind: 'between',
      name: 'X',
      prefix: '/X/',
      suffix: '/',
      replacement: 'R',
    };
    // Greedy would collapse both pairs into one span; non-greedy keeps them separate.
    expect(redact('/X/one/middle/X/two/', [rule])).toBe('Rmiddle/X/two/'.replace(/\/X\/two\//, 'R'));
  });

  it('handles BETWEEN spans across newlines', () => {
    const rule: RedactionRule = {
      kind: 'between',
      name: 'X',
      prefix: '<<',
      suffix: '>>',
      replacement: '#',
    };
    expect(redact('a <<line1\nline2>> b', [rule])).toBe('a # b');
  });

  it('replaces a REGEX match', () => {
    const rule: RedactionRule = {
      kind: 'regex',
      name: 'iban',
      pattern: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b',
      replacement: 'XX****************',
    };
    expect(redact('From SA6810000062513547000100 to bob', [rule])).toBe('From XX**************** to bob');
  });

  it('applies multiple rules in order; later rules see redacted text', () => {
    const rules: RedactionRule[] = [
      { kind: 'regex', name: 'a', pattern: 'one', replacement: 'two' },
      { kind: 'regex', name: 'b', pattern: 'two', replacement: 'three' },
    ];
    expect(redact('one', rules)).toBe('three');
  });

  it('does not throw on a malformed regex and continues with remaining rules', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const rules: RedactionRule[] = [
        { kind: 'regex', name: 'bad', pattern: '([', replacement: 'X' },
        { kind: 'regex', name: 'good', pattern: 'foo', replacement: 'BAR' },
      ];
      expect(redact('foo', rules)).toBe('BAR');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  describe('with the bundled REDACTION_RULES seed', () => {
    let bundled: RedactionRule[];
    beforeEach(async () => {
      bundled = (await import('../../data/redactionRules')).REDACTION_RULES;
    });
    afterEach(() => {
      vi.clearAllMocks();
    });

    it('masks a Saudi IBAN with no spaces', () => {
      const out = redact('IBAN SA6810000062513547000100 done', bundled);
      expect(out).toBe('IBAN IBAN done');
      expect(out).not.toContain('SA6810000062513547000100');
    });

    it('masks an ORDP narrative span end-to-end', () => {
      expect(redact('/ORDP/Innovasea Marine/', bundled)).toBe('Ordering Party');
    });

    it('masks both narrative + IBAN in one pass', () => {
      const out = redact('Ref /IBAN/SA6810000062513547000100/ thanks', bundled);
      // The narrative rule fires first (catches the /IBAN/.../ span), so the
      // result should carry the Account No label and not the raw IBAN.
      expect(out).toContain('Account No');
      expect(out).not.toContain('SA6810000062513547000100');
    });
  });
});

describe('redactSegments', () => {
  const rules: RedactionRule[] = [
    { kind: 'regex', name: 'iban', pattern: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b', replacement: 'IBAN' },
    { kind: 'between', name: 'benm', prefix: '/BENM/', suffix: '/', replacement: 'Beneficiary' },
  ];

  it('returns an empty array for empty input', () => {
    expect(redactSegments('', rules)).toEqual([]);
  });

  it('returns a single non-redacted segment when nothing matches', () => {
    expect(redactSegments('plain text', rules)).toEqual([{ text: 'plain text', redacted: false }]);
  });

  it('splits a match into a redacted segment carrying the label', () => {
    const segs = redactSegments('to SA6810000062513547000100 now', rules);
    expect(segs).toEqual([
      { text: 'to ', redacted: false },
      { text: 'IBAN', redacted: true },
      { text: ' now', redacted: false },
    ]);
  });

  it('freezes a redacted segment so later rules do not re-match the label', () => {
    // 'Beneficiary' (a between replacement) must not be chewed on by a later
    // word rule that targets the literal label.
    const chained: RedactionRule[] = [
      { kind: 'between', name: 'benm', prefix: '/BENM/', suffix: '/', replacement: 'Beneficiary' },
      { kind: 'regex', name: 'word', pattern: 'Beneficiary', replacement: 'XXX' },
    ];
    const segs = redactSegments('/BENM/Acme/', chained);
    expect(segs).toEqual([{ text: 'Beneficiary', redacted: true }]);
  });

  it('joins back to the same string as redact()', () => {
    const text = 'Ref SA6810000062513547000100 /BENM/Acme Ltd/ end';
    const joined = redactSegments(text, rules).map((s) => s.text).join('');
    expect(joined).toBe(redact(text, rules));
  });
});
