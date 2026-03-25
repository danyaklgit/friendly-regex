import { describe, it, expect } from 'vitest';
import { generateId, generateExpressionId } from './uuid';

describe('generateId', () => {
  it('returns a valid UUID string', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns unique values on each call', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });
});

describe('generateExpressionId', () => {
  it('formats as tagId-prefix-index', () => {
    expect(generateExpressionId('tag-123', 'rule', 0)).toBe('tag-123-rule-0');
  });

  it('handles different indices', () => {
    expect(generateExpressionId('abc', 'cond', 5)).toBe('abc-cond-5');
  });
});
