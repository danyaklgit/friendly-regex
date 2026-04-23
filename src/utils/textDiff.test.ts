import { describe, it, expect } from 'vitest';
import { diffStrings } from './textDiff';

describe('diffStrings', () => {
  it('returns everything in head when strings are identical', () => {
    expect(diffStrings('abc', 'abc')).toEqual({
      head: 'abc',
      oldMiddle: '',
      newMiddle: '',
      tail: '',
    });
  });

  it('finds common prefix and suffix around a middle change', () => {
    // "IBAN/SA\d{2}(.{2})" vs "IBAN/SA\d{3}(.{2})" — the only change is 2 → 3
    const d = diffStrings('IBAN/SA\\d{2}(.{2})', 'IBAN/SA\\d{3}(.{2})');
    expect(d.head).toBe('IBAN/SA\\d{');
    expect(d.oldMiddle).toBe('2');
    expect(d.newMiddle).toBe('3');
    expect(d.tail).toBe('}(.{2})');
  });

  it('handles pure prefix change (no shared suffix)', () => {
    const d = diffStrings('/ORDP/', '/ORDR/');
    // 'd' and 'R' differ, but '/' remains shared on both ends
    expect(d.head).toBe('/ORD');
    expect(d.oldMiddle).toBe('P');
    expect(d.newMiddle).toBe('R');
    expect(d.tail).toBe('/');
  });

  it('handles pure suffix change (no shared tail beyond empty)', () => {
    const d = diffStrings('abc123', 'abc999');
    expect(d.head).toBe('abc');
    expect(d.oldMiddle).toBe('123');
    expect(d.newMiddle).toBe('999');
    expect(d.tail).toBe('');
  });

  it('handles addition at the end', () => {
    const d = diffStrings('abc', 'abcdef');
    expect(d.head).toBe('abc');
    expect(d.oldMiddle).toBe('');
    expect(d.newMiddle).toBe('def');
    expect(d.tail).toBe('');
  });

  it('handles addition at the start', () => {
    const d = diffStrings('def', 'abcdef');
    expect(d.head).toBe('');
    expect(d.oldMiddle).toBe('');
    expect(d.newMiddle).toBe('abc');
    expect(d.tail).toBe('def');
  });

  it('handles deletion in the middle', () => {
    const d = diffStrings('abcXYZdef', 'abcdef');
    expect(d.head).toBe('abc');
    expect(d.oldMiddle).toBe('XYZ');
    expect(d.newMiddle).toBe('');
    expect(d.tail).toBe('def');
  });

  it('does not let prefix and suffix overlap when strings share the same char', () => {
    // Old "aaaa" vs new "aa": prefix=2 matches both, but suffix must stop
    // before crossing into the prefix region on the shorter side.
    const d = diffStrings('aaaa', 'aa');
    // Both strings consist entirely of the same character — either all head or
    // all tail is valid; what matters is that the middles don't lie.
    expect(d.head + d.oldMiddle + d.tail).toBe('aaaa');
    expect(d.head + d.newMiddle + d.tail).toBe('aa');
  });

  it('handles no common prefix or suffix', () => {
    const d = diffStrings('abc', 'xyz');
    expect(d.head).toBe('');
    expect(d.oldMiddle).toBe('abc');
    expect(d.newMiddle).toBe('xyz');
    expect(d.tail).toBe('');
  });

  it('handles empty old string', () => {
    const d = diffStrings('', 'new');
    expect(d.head).toBe('');
    expect(d.oldMiddle).toBe('');
    expect(d.newMiddle).toBe('new');
    expect(d.tail).toBe('');
  });

  it('handles empty new string', () => {
    const d = diffStrings('old', '');
    expect(d.head).toBe('');
    expect(d.oldMiddle).toBe('old');
    expect(d.newMiddle).toBe('');
    expect(d.tail).toBe('');
  });
});
