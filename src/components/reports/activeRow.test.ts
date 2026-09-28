import { describe, it, expect } from 'vitest';
import { activeRow } from './activeRow';

describe('activeRow', () => {
  it('returns the first payload entry row only while active', () => {
    const row = { periodStart: '2024-01-01' };
    expect(activeRow({ active: true, payload: [{ payload: row }] })).toBe(row);
    expect(activeRow({ active: false, payload: [{ payload: row }] })).toBeNull();
    expect(activeRow({ active: true, payload: [] })).toBeNull();
    expect(activeRow({ active: true, payload: null })).toBeNull();
    expect(activeRow({})).toBeNull();
  });
});
