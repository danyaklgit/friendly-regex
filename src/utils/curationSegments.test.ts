import { describe, expect, it } from 'vitest';
import type { CurationSpan } from '../api/sampling';
import {
  normalizeSelection,
  removePillAt,
  replacePillAt,
  replaceRangeWithPill,
  segmentsFromSpans,
  segmentsFromText,
  segmentsHavePills,
  segmentsText,
  segmentsToTokens,
  type CurationSegment,
} from './curationSegments';

const lit = (text: string): CurationSegment => ({ text, token: null });
const pill = (text: string, token: CurationSegment['token']): CurationSegment => ({ text, token });

describe('segmentsFromSpans', () => {
  it('maps literal spans to literal segments and token spans to pills', () => {
    const spans: CurationSpan[] = [
      { Start: 0, Length: 6, Text: 'FAVOR ', Token: { Field: 'AI', Kind: 'Literal', Text: 'FAVOR' } },
      { Start: 6, Length: 4, Text: 'HSBC', Token: { Field: 'AI', Kind: 'List', Text: 'BANKS' } },
      { Start: 10, Length: 8, Text: ' LONDON', Token: { Field: 'AI', Kind: 'Literal', Text: 'LONDON' } },
    ];
    const segs = segmentsFromSpans(spans);
    expect(segs).toHaveLength(3);
    expect(segs[0].token).toBeNull();
    expect(segs[1].token).toEqual({ Kind: 'List', Text: 'BANKS', Item: null, Length: null });
    expect(segmentsText(segs)).toBe('FAVOR HSBC LONDON');
  });

  it('keeps CHAR Length on the pill', () => {
    const spans: CurationSpan[] = [
      { Start: 0, Length: 16, Text: 'A1B2C3D4E5F6G7H8', Token: { Field: 'D2', Kind: 'Placeholder', Text: 'CHAR', Length: 16 } },
    ];
    expect(segmentsFromSpans(spans)[0].token?.Length).toBe(16);
  });
});

describe('segmentsFromText', () => {
  it('wraps text in one literal segment and empty text in none', () => {
    expect(segmentsFromText('HELLO')).toEqual([lit('HELLO')]);
    expect(segmentsFromText('')).toEqual([]);
  });
});

describe('replaceRangeWithPill', () => {
  const shape = { Kind: 'Placeholder' as const, Text: 'INT' };

  it('splits a literal around the range, preserving every original character', () => {
    const segs = [lit('REF 12345 PAYMENT')];
    const out = replaceRangeWithPill(segs, 0, 4, 9, shape)!;
    expect(out.map((s) => s.text)).toEqual(['REF ', '12345', ' PAYMENT']);
    expect(out[1].token).toEqual(shape);
    expect(segmentsText(out)).toBe('REF 12345 PAYMENT');
  });

  it('handles a range at the very start and very end', () => {
    expect(replaceRangeWithPill([lit('12345 REF')], 0, 0, 5, shape)!.map((s) => s.text)).toEqual(['12345', ' REF']);
    expect(replaceRangeWithPill([lit('REF 12345')], 0, 4, 9, shape)!.map((s) => s.text)).toEqual(['REF ', '12345']);
  });

  it('refuses pills, empty ranges, and out-of-bounds ranges', () => {
    const segs = [pill('X', { Kind: 'Placeholder', Text: 'AR' }), lit('ABC')];
    expect(replaceRangeWithPill(segs, 0, 0, 1, shape)).toBeNull();
    expect(replaceRangeWithPill(segs, 1, 2, 2, shape)).toBeNull();
    expect(replaceRangeWithPill(segs, 1, 1, 9, shape)).toBeNull();
  });
});

describe('replacePillAt / removePillAt', () => {
  it('swaps a pill in place, keeping the covered text', () => {
    const segs = [lit('PAY '), pill('HSBC', { Kind: 'List', Text: 'BANKS' })];
    const out = replacePillAt(segs, 1, { Kind: 'List', Text: 'BANKS', Item: 'HSBC' })!;
    expect(out[1].text).toBe('HSBC');
    expect(out[1].token?.Item).toBe('HSBC');
  });

  it('removePillAt restores the original text and fuses literal neighbours', () => {
    const segs = [lit('REF '), pill('12345', { Kind: 'Placeholder', Text: 'INT' }), lit(' PAYMENT')];
    const out = removePillAt(segs, 1)!;
    expect(out).toEqual([lit('REF 12345 PAYMENT')]);
  });

  it('both refuse the wrong segment kind', () => {
    expect(replacePillAt([lit('A')], 0, { Kind: 'Placeholder', Text: 'AR' })).toBeNull();
    expect(removePillAt([lit('A')], 0)).toBeNull();
  });
});

describe('normalizeSelection', () => {
  const segs = [lit('REF 12345 '), pill('HSBC', { Kind: 'List', Text: 'BANKS' })];

  it('orders reversed selections and trims whitespace off the edges', () => {
    const sel = normalizeSelection(segs, 0, 9, 0, 3)!;
    expect(sel).toEqual({ index: 0, start: 4, end: 9, text: '12345' });
  });

  it('rejects selections that cross segments, land on a pill, or are blank', () => {
    expect(normalizeSelection(segs, 0, 8, 1, 2)).toBeNull();
    expect(normalizeSelection(segs, 1, 0, 1, 4)).toBeNull();
    expect(normalizeSelection(segs, 0, 3, 0, 4)).toBeNull();
    expect(normalizeSelection(segs, 0, 5, 0, 5)).toBeNull();
  });
});

describe('segmentsToTokens', () => {
  it('derives trimmed literals and pills with whitespace-driven glue', () => {
    const segs = [lit('FAVOR '), pill('HSBC', { Kind: 'List', Text: 'BANKS' }), lit(' LONDON')];
    const tokens = segmentsToTokens('AI', segs);
    expect(tokens).toEqual([
      { Field: 'AI', Kind: 'Literal', Text: 'FAVOR', Glued: false },
      { Field: 'AI', Kind: 'List', Text: 'BANKS', Glued: false },
      { Field: 'AI', Kind: 'Literal', Text: 'LONDON', Glued: false },
    ]);
  });

  it('marks a pill inside a word as glued on both sides', () => {
    const segs = [lit('INV'), pill('2024', { Kind: 'Placeholder', Text: 'INT' }), lit('X REF')];
    const tokens = segmentsToTokens('D2', segs);
    expect(tokens[1].Glued).toBe(true);
    expect(tokens[2]).toMatchObject({ Kind: 'Literal', Text: 'X REF', Glued: true });
  });

  it('drops whitespace-only literals but keeps them as gaps', () => {
    const segs = [pill('A', { Kind: 'Placeholder', Text: 'AR' }), lit('   '), pill('B', { Kind: 'Placeholder', Text: 'INT' })];
    const tokens = segmentsToTokens('AI', segs);
    expect(tokens).toHaveLength(2);
    expect(tokens[1].Glued).toBe(false);
  });

  it('carries Item and Length through to the token', () => {
    const segs = [
      pill('VISA', { Kind: 'List', Text: 'CARD_TYPES', Item: 'Visa' }),
      pill('ABCDEFGH12345678', { Kind: 'Placeholder', Text: 'CHAR', Length: 16 }),
    ];
    const tokens = segmentsToTokens('AI', segs);
    expect(tokens[0].Item).toBe('Visa');
    expect(tokens[1].Length).toBe(16);
    expect(tokens[1].Glued).toBe(true);
  });

  it('never marks the first token glued', () => {
    expect(segmentsToTokens('AI', [pill('X', { Kind: 'Placeholder', Text: 'AR' })])[0].Glued).toBe(false);
  });
});

describe('segmentsHavePills', () => {
  it('reports whether any pill exists', () => {
    expect(segmentsHavePills([lit('A')])).toBe(false);
    expect(segmentsHavePills([lit('A'), pill('B', { Kind: 'Placeholder', Text: 'AR' })])).toBe(true);
  });
});
