import { describe, it, expect } from 'vitest';
import { sha256 } from './sha256';

describe('sha256', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await sha256('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces consistent output for the same input', async () => {
    const a = await sha256('test');
    const b = await sha256('test');
    expect(a).toBe(b);
  });

  it('produces different output for different inputs', async () => {
    const a = await sha256('hello');
    const b = await sha256('world');
    expect(a).not.toBe(b);
  });

  it('handles empty string', async () => {
    const hash = await sha256('');
    expect(hash).toHaveLength(64);
  });
});
