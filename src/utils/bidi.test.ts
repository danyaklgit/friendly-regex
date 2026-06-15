import { describe, it, expect } from 'vitest';
import { containsRtl } from './bidi';

describe('containsRtl', () => {
  it('is false for pure ASCII / English text', () => {
    expect(containsRtl('LP IPSP2300EXIXI BWA FOR INFORMATION TECH')).toBe(false);
    expect(containsRtl('Charges:     5.00 REM ID:1010')).toBe(false);
  });

  it('is false for empty string', () => {
    expect(containsRtl('')).toBe(false);
  });

  it('is true for Arabic text', () => {
    expect(containsRtl('شركة بواء لتقنية المعلومات')).toBe(true);
  });

  it('is true for mixed Arabic + English (the real narrative case)', () => {
    expect(containsRtl('01 FOR TESTING RIYAD BANK شركة بواء HEAD OFFICE')).toBe(true);
  });

  it('is true for Hebrew text', () => {
    expect(containsRtl('שלום')).toBe(true);
  });

  it('is true for Arabic presentation forms (copy-pasted source data)', () => {
    expect(containsRtl('ﻲﺮ')).toBe(true);
  });

  it('is false for non-letter symbols and digits only', () => {
    expect(containsRtl('1234567890 / - : .')).toBe(false);
  });
});
