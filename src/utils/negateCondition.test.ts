import { describe, it, expect } from 'vitest';
import type { ConditionFormValue, MatchOperation } from '../types';
import { negateCondition } from './negateCondition';

function cond(
  operation: MatchOperation,
  partial: Partial<ConditionFormValue> = {},
): ConditionFormValue {
  return {
    id: 'src',
    sourceField: 'Description1',
    operation,
    value: 'X',
    ...partial,
  };
}

describe('negateCondition', () => {
  // Simple-opposite pairs. Every entry exercised both directions to catch
  // accidental table asymmetry.
  const PAIRS: [MatchOperation, MatchOperation][] = [
    ['contains', 'does_not_contain'],
    ['does_not_contain', 'contains'],
    ['begins_with', 'does_not_start_with'],
    ['does_not_start_with', 'begins_with'],
    ['ends_with', 'does_not_end_with'],
    ['does_not_end_with', 'ends_with'],
    ['equals', 'does_not_equal'],
    ['does_not_equal', 'equals'],
    ['greater_than', 'less_than_or_equal'],
    ['less_than', 'greater_than_or_equal'],
    ['greater_than_or_equal', 'less_than'],
    ['less_than_or_equal', 'greater_than'],
    ['is_blank_or_empty', 'is_not_blank_or_empty'],
    ['is_not_blank_or_empty', 'is_blank_or_empty'],
  ];

  for (const [from, to] of PAIRS) {
    it(`${from} -> ${to}`, () => {
      const result = negateCondition(cond(from));
      expect(result).not.toBeNull();
      expect(result!.operation).toBe(to);
      expect(result!.sourceField).toBe('Description1');
      expect(result!.value).toBe('X');
      // Fresh id so the negated condition can land in an existing
      // AndGroup without colliding with the source.
      expect(result!.id).not.toBe('src');
    });
  }

  it('preserves multi-value `values` on simple opposites that use them', () => {
    // `values` is a passthrough field; the simple-opposite path doesn't
    // touch the value semantics, just the operation. matches_pattern is
    // tested separately below — only the multi-value carriers reach this
    // assertion as a sanity check.
    const r = negateCondition(cond('contains', { values: ['a', 'b'] }));
    expect(r?.values).toEqual(['a', 'b']);
  });

  describe('matches_pattern (multi-value)', () => {
    it('wraps the alternation in a negative lookahead via match_regex', () => {
      const r = negateCondition(cond('matches_pattern', { values: ['REF1', 'REF2'], value: '' }));
      expect(r?.operation).toBe('match_regex');
      expect(r?.value).toBe('^(?!(REF1|REF2)$).*$');
    });

    it('escapes regex metacharacters in each alternation arm', () => {
      // `+`, `?`, `(`, `)`, `.`, etc. must be neutralized so the
      // alternation matches the literal value, not a regex pattern.
      const r = negateCondition(cond('matches_pattern', { values: ['A+B', 'C.D'], value: '' }));
      expect(r?.value).toBe('^(?!(A\\+B|C\\.D)$).*$');
    });

    it('falls back to single `value` when `values` is missing', () => {
      // Defensive: if a legacy condition has matches_pattern but only
      // populated `value`, we still produce a usable negation.
      const r = negateCondition(cond('matches_pattern', { value: 'SOLO' }));
      expect(r?.value).toBe('^(?!(SOLO)$).*$');
    });

    it('returns null for an empty values array (nothing to negate)', () => {
      const r = negateCondition(cond('matches_pattern', { values: [], value: '' }));
      expect(r).toBeNull();
    });
  });

  describe('match_regex (free-form)', () => {
    it('wraps the original pattern in a global negative lookahead', () => {
      const r = negateCondition(cond('match_regex', { value: '\\d{4}' }));
      expect(r?.operation).toBe('match_regex');
      expect(r?.value).toBe('^(?!.*(\\d{4})).*$');
    });

    it('returns null for empty pattern', () => {
      // No pattern means nothing to negate; the caller should not
      // produce a condition that matches everything.
      const r = negateCondition(cond('match_regex', { value: '' }));
      expect(r).toBeNull();
    });
  });

  it('returns null for an unknown operation', () => {
    // Defensive guard for legacy / corrupted form state where the
    // operation field carries a value not in the catalog.
    const c = cond('contains');
    (c as { operation: string }).operation = 'unknown_op_xyz';
    expect(negateCondition(c)).toBeNull();
  });
});
