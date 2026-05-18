import { describe, it, expect } from 'vitest';
import { numRange } from './intRangeAlternation';

function matches(pattern: string, sample: string): boolean {
  return new RegExp(`^(?:${pattern})$`).test(sample);
}

describe('numRange', () => {
  it('returns the literal padded value when min === max', () => {
    expect(numRange(5, 5, 3)).toBe('005');
    expect(numRange(2024, 2024, 4)).toBe('2024');
  });

  it('matches every value in [1, 12] for 2-digit width', () => {
    const r = numRange(1, 12, 2);
    for (let i = 1; i <= 12; i++) {
      expect(matches(r, String(i).padStart(2, '0'))).toBe(true);
    }
    expect(matches(r, '00')).toBe(false);
    expect(matches(r, '13')).toBe(false);
    expect(matches(r, '99')).toBe(false);
  });

  it('matches every value in [1, 31] for 2-digit width', () => {
    const r = numRange(1, 31, 2);
    for (let i = 1; i <= 31; i++) {
      expect(matches(r, String(i).padStart(2, '0'))).toBe(true);
    }
    expect(matches(r, '00')).toBe(false);
    expect(matches(r, '32')).toBe(false);
    expect(matches(r, '99')).toBe(false);
  });

  it('matches every value in [2025, 9999] for 4-digit width', () => {
    const r = numRange(2025, 9999, 4);
    expect(matches(r, '2025')).toBe(true);
    expect(matches(r, '2026')).toBe(true);
    expect(matches(r, '3000')).toBe(true);
    expect(matches(r, '9999')).toBe(true);
    expect(matches(r, '2024')).toBe(false);
    expect(matches(r, '2000')).toBe(false);
    expect(matches(r, '1999')).toBe(false);
  });

  it('matches every value in [0, 2023] for 4-digit width', () => {
    const r = numRange(0, 2023, 4);
    expect(matches(r, '0000')).toBe(true);
    expect(matches(r, '0001')).toBe(true);
    expect(matches(r, '1999')).toBe(true);
    expect(matches(r, '2023')).toBe(true);
    expect(matches(r, '2024')).toBe(false);
    expect(matches(r, '9999')).toBe(false);
  });

  it('handles single-width ranges', () => {
    expect(numRange(0, 9, 1)).toBe('[0-9]');
    expect(numRange(5, 5, 1)).toBe('5');
    expect(matches(numRange(0, 9, 1), '0')).toBe(true);
    expect(matches(numRange(0, 9, 1), '9')).toBe(true);
  });
});
