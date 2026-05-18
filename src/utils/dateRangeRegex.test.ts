import { describe, it, expect } from 'vitest';
import { compileDateRangeRegex } from './dateRangeRegex';

function matches(regex: string | null, sample: string): boolean {
  if (regex == null) return false;
  return new RegExp(regex).test(sample);
}

describe('compileDateRangeRegex', () => {
  describe('parsing', () => {
    it('returns null for non-date strings', () => {
      expect(compileDateRangeRegex('not-a-date', 'gt')).toBeNull();
      expect(compileDateRangeRegex('', 'gt')).toBeNull();
      expect(compileDateRangeRegex('2024/01/01', 'gt')).toBeNull();
    });

    it('returns null for out-of-range months/days', () => {
      expect(compileDateRangeRegex('2024-13-01', 'gt')).toBeNull();
      expect(compileDateRangeRegex('2024-00-15', 'gt')).toBeNull();
      expect(compileDateRangeRegex('2024-01-32', 'gt')).toBeNull();
      expect(compileDateRangeRegex('2024-01-00', 'gt')).toBeNull();
    });
  });

  describe('greater than', () => {
    it('matches dates strictly after the threshold', () => {
      const r = compileDateRangeRegex('2024-01-29', 'gt');
      expect(matches(r, '2024-01-30')).toBe(true);
      expect(matches(r, '2024-02-01')).toBe(true);
      expect(matches(r, '2025-01-01')).toBe(true);
      expect(matches(r, '2024-01-29')).toBe(false);
      expect(matches(r, '2024-01-28')).toBe(false);
      expect(matches(r, '2023-12-31')).toBe(false);
    });

    it('handles end-of-month boundary (2024-01-31 → only Feb+ match)', () => {
      const r = compileDateRangeRegex('2024-01-31', 'gt');
      expect(matches(r, '2024-02-01')).toBe(true);
      expect(matches(r, '2024-01-31')).toBe(false);
    });

    it('handles end-of-year boundary (2024-12-31 → only 2025+ match)', () => {
      const r = compileDateRangeRegex('2024-12-31', 'gt');
      expect(matches(r, '2025-01-01')).toBe(true);
      expect(matches(r, '2024-12-31')).toBe(false);
      expect(matches(r, '2024-11-30')).toBe(false);
    });

    it('returns null when threshold has no greater date (9999-12-31)', () => {
      expect(compileDateRangeRegex('9999-12-31', 'gt')).toBeNull();
    });
  });

  describe('less than', () => {
    it('matches dates strictly before the threshold', () => {
      const r = compileDateRangeRegex('2024-01-29', 'lt');
      expect(matches(r, '2024-01-28')).toBe(true);
      expect(matches(r, '2024-01-01')).toBe(true);
      expect(matches(r, '2023-12-31')).toBe(true);
      expect(matches(r, '2024-01-29')).toBe(false);
      expect(matches(r, '2024-01-30')).toBe(false);
    });

    it('handles start-of-year boundary (2024-01-01 → only 2023- match)', () => {
      const r = compileDateRangeRegex('2024-01-01', 'lt');
      expect(matches(r, '2023-12-31')).toBe(true);
      expect(matches(r, '2024-01-01')).toBe(false);
      expect(matches(r, '2024-01-02')).toBe(false);
    });
  });

  describe('ISO-timestamp tolerance', () => {
    it('matches both bare YYYY-MM-DD and ISO timestamps starting with it', () => {
      const r = compileDateRangeRegex('2024-01-29', 'gt');
      expect(matches(r, '2024-01-30')).toBe(true);
      expect(matches(r, '2024-01-30T00:00:00Z')).toBe(true);
      expect(matches(r, '2024-01-29T23:59:59Z')).toBe(false);
    });
  });

  describe('compatibility with reference algorithm', () => {
    it('compiles >2024-01-29 with the three expected branches', () => {
      const r = compileDateRangeRegex('2024-01-29', 'gt')!;
      // Anchor and ISO tolerance present
      expect(r.startsWith('^(?:')).toBe(true);
      expect(r.endsWith('(T|$)')).toBe(true);
      // Spot-check the same-month branch matches "2024-01-30" but not earlier
      expect(matches(r, '2024-01-30')).toBe(true);
      expect(matches(r, '2024-01-29')).toBe(false);
    });
  });
});
