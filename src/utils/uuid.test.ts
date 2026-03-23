import { describe, it, expect } from 'vitest';
import { generateExpressionId } from './uuid';

describe('generateExpressionId', () => {
  it('formats as tagId-prefix-index', () => {
    expect(generateExpressionId('tag-123', 'rule', 0)).toBe('tag-123-rule-0');
  });

  it('handles different indices', () => {
    expect(generateExpressionId('abc', 'cond', 5)).toBe('abc-cond-5');
  });
});
