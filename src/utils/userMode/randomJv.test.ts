import { describe, it, expect } from 'vitest';
import { randomJv } from './randomJv';

describe('randomJv', () => {
  it('always returns a 7-digit string', () => {
    for (let i = 0; i < 100; i++) {
      const v = randomJv();
      expect(v).toMatch(/^[1-9]\d{6}$/);
    }
  });

  it('does not always return the same value', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(randomJv());
    // 50 draws from ~9 million possibilities — collision probability is vanishing.
    expect(seen.size).toBeGreaterThan(40);
  });
});
