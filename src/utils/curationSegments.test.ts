import { describe, expect, it } from 'vitest';
import type { CurationSpan } from '../api/sampling';
import {
  excludeRange,
  includeSegmentAt,
  insertSegmentAt,
  normalizeSelection,
  removeSegmentFromKey,
  replacePillAt,
  replaceRangeWithPill,
  restorePillToWords,
  segmentsFromSpans,
  segmentsFromText,
  segmentsHavePills,
  segmentsText,
  segmentsToTokens,
  setInsertedGlued,
  splitSourceSegmentAt,
  type CurationSegment,
  type SegmentPill,
} from './curationSegments';

const lit = (text: string): CurationSegment => ({ text, token: null, inKey: true, inserted: false, glued: false });
const exc = (text: string): CurationSegment => ({ text, token: null, inKey: false, inserted: false, glued: false });
const pill = (text: string, token: SegmentPill): CurationSegment => ({ text, token, inKey: true, inserted: false, glued: false });
const insWords = (text: string, glued = false): CurationSegment => ({ text, token: null, inKey: true, inserted: true, glued });
const insPill = (token: SegmentPill, glued = false): CurationSegment => ({ text: '', token, inKey: true, inserted: true, glued });

const INT: SegmentPill = { Kind: 'Placeholder', Text: 'INT' };
const BANKS: SegmentPill = { Kind: 'List', Text: 'BANKS' };

describe('segmentsFromSpans', () => {
  it('maps literal spans to kept words and token spans to pills', () => {
    const spans: CurationSpan[] = [
      { Start: 0, Length: 6, Text: 'FAVOR ', Token: { Field: 'AI', Kind: 'Literal', Text: 'FAVOR' } },
      { Start: 6, Length: 4, Text: 'HSBC', Token: { Field: 'AI', Kind: 'List', Text: 'BANKS' } },
    ];
    const segs = segmentsFromSpans(spans);
    expect(segs[0]).toEqual(lit('FAVOR '));
    expect(segs[1].token).toEqual({ Kind: 'List', Text: 'BANKS', Item: null, Length: null });
    expect(segmentsText(segs)).toBe('FAVOR HSBC');
  });

  it('maps InKey:false to excluded and Inserted:true to inserted (editing delta)', () => {
    const spans: CurationSpan[] = [
      { Start: 0, Length: 10, Text: 'REFERENCE ', Token: { Field: 'AI', Kind: 'Literal', Text: 'REFERENCE' } },
      { Start: -1, Length: 0, Text: 'PAY', Token: { Field: 'AI', Kind: 'Literal', Text: 'PAY' }, Inserted: true },
      { Start: 10, Length: 8, Text: '55074548', Token: { Field: 'AI', Kind: 'Literal', Text: '55074548' }, InKey: false },
      { Start: -1, Length: 0, Text: '', Token: { Field: 'AI', Kind: 'Placeholder', Text: 'INT', Glued: true }, Inserted: true },
    ];
    const segs = segmentsFromSpans(spans);
    expect(segs[1]).toEqual(insWords('PAY'));
    expect(segs[2]).toEqual(exc('55074548'));
    // Inserted pill keeps its saved glue (token normalized with null Item/Length).
    expect(segs[3]).toEqual(insPill({ ...INT, Item: null, Length: null }, true));
    // The original text is the NON-inserted concatenation only.
    expect(segmentsText(segs)).toBe('REFERENCE 55074548');
  });

  it('keeps CHAR Length on the pill', () => {
    const spans: CurationSpan[] = [
      { Start: 0, Length: 2, Text: 'FM', Token: { Field: 'D2', Kind: 'Placeholder', Text: 'CHAR', Length: 2 } },
    ];
    expect(segmentsFromSpans(spans)[0].token?.Length).toBe(2);
  });
});

describe('segmentsFromText', () => {
  it('wraps text in one kept segment and empty text in none', () => {
    expect(segmentsFromText('HELLO')).toEqual([lit('HELLO')]);
    expect(segmentsFromText('')).toEqual([]);
  });
});

describe('replaceRangeWithPill', () => {
  it('splits kept words around the range, preserving every original character', () => {
    const out = replaceRangeWithPill([lit('REF 12345 PAYMENT')], 0, 4, 9, INT)!;
    expect(out.map((s) => s.text)).toEqual(['REF ', '12345', ' PAYMENT']);
    expect(out[1].token).toEqual(INT);
    expect(segmentsText(out)).toBe('REF 12345 PAYMENT');
  });

  it('a pill over EXCLUDED text puts it back into the key, the rest stays excluded', () => {
    const out = replaceRangeWithPill([lit('A '), exc('BC DEF'), lit(' G')], 1, 0, 2, INT)!;
    expect(out[1]).toEqual({ text: 'BC', token: INT, inKey: true, inserted: false, glued: false });
    expect(out[2]).toEqual(exc(' DEF'));
  });

  it('refuses pills, inserted segments, and bad ranges', () => {
    expect(replaceRangeWithPill([pill('X', INT)], 0, 0, 1, BANKS)).toBeNull();
    expect(replaceRangeWithPill([insWords('PAY')], 0, 0, 3, INT)).toBeNull();
    expect(replaceRangeWithPill([lit('ABC')], 0, 2, 2, INT)).toBeNull();
    expect(replaceRangeWithPill([lit('ABC')], 0, 1, 9, INT)).toBeNull();
  });
});

describe('restorePillToWords / replacePillAt', () => {
  it('"Back to the exact words" restores the text and fuses kept neighbours', () => {
    const segs = [lit('REF '), pill('12345', INT), lit(' PAYMENT')];
    expect(restorePillToWords(segs, 1)).toEqual([lit('REF 12345 PAYMENT')]);
  });

  it('refuses an inserted pill (nothing to restore)', () => {
    expect(restorePillToWords([insPill(INT)], 0)).toBeNull();
  });

  it('replacePillAt swaps the token on source-backed and inserted pills alike', () => {
    expect(replacePillAt([pill('HSBC', BANKS)], 0, { ...BANKS, Item: 'HSBC' })![0].token?.Item).toBe('HSBC');
    const out = replacePillAt([insPill(INT, true)], 0, BANKS)!;
    expect(out[0].token).toEqual(BANKS);
    expect(out[0].glued).toBe(true);
  });
});

describe('removeSegmentFromKey', () => {
  it("a source-backed pill's text becomes excluded (struck through)", () => {
    const out = removeSegmentFromKey([lit('REF '), pill('12345', INT)], 1)!;
    expect(out[1]).toEqual(exc('12345'));
    expect(segmentsText(out)).toBe('REF 12345');
  });

  it('an inserted segment is simply deleted', () => {
    expect(removeSegmentFromKey([lit('A'), insWords('PAY')], 1)).toEqual([lit('A')]);
    expect(removeSegmentFromKey([lit('A'), insPill(INT)], 1)).toEqual([lit('A')]);
  });

  it('fuses the exclusion with an adjacent excluded run', () => {
    const out = removeSegmentFromKey([exc('X '), pill('12345', INT)], 1)!;
    expect(out).toEqual([exc('X 12345')]);
  });

  it('refuses plain text segments (use excludeRange for words)', () => {
    expect(removeSegmentFromKey([lit('A')], 0)).toBeNull();
  });
});

describe('excludeRange / includeSegmentAt', () => {
  it('excludes the selected words; the words around them stay kept', () => {
    const out = excludeRange([lit('REFERENCE 55074548 FM240305')], 0, 10, 18)!;
    expect(out.map((s) => [s.text, s.inKey])).toEqual([
      ['REFERENCE ', true],
      ['55074548', false],
      [' FM240305', true],
    ]);
    expect(segmentsText(out)).toBe('REFERENCE 55074548 FM240305');
  });

  it('includeSegmentAt brings excluded text back as kept words and fuses', () => {
    const segs = [lit('REFERENCE '), exc('55074548'), lit(' FM')];
    expect(includeSegmentAt(segs, 1)).toEqual([lit('REFERENCE 55074548 FM')]);
  });

  it('both refuse the wrong segment kinds', () => {
    expect(excludeRange([exc('A')], 0, 0, 1)).toBeNull();
    expect(excludeRange([pill('X', INT)], 0, 0, 1)).toBeNull();
    expect(includeSegmentAt([lit('A')], 0)).toBeNull();
    expect(includeSegmentAt([insWords('A')], 0)).toBeNull();
  });
});

describe('insertSegmentAt / splitSourceSegmentAt / setInsertedGlued', () => {
  it('inserts typed words (trimmed) and pills at an array position', () => {
    const withWords = insertSegmentAt([lit('REFERENCE X')], 1, { text: '  PAY ' })!;
    expect(withWords[1]).toEqual(insWords('PAY'));
    const withPill = insertSegmentAt([lit('A')], 0, { token: INT, glued: true })!;
    expect(withPill[0]).toEqual(insPill(INT, true));
  });

  it('refuses empty words and out-of-range positions', () => {
    expect(insertSegmentAt([lit('A')], 1, { text: '   ' })).toBeNull();
    expect(insertSegmentAt([lit('A')], 5, { text: 'X' })).toBeNull();
  });

  it('splitSourceSegmentAt splits kept text at an inner offset, keeping edges intact', () => {
    const inner = splitSourceSegmentAt([lit('REFERENCE 55074548')], 0, 10)!;
    expect(inner.segments.map((s) => s.text)).toEqual(['REFERENCE ', '55074548']);
    expect(inner.index).toBe(1);
    expect(splitSourceSegmentAt([lit('AB')], 0, 0)).toEqual({ segments: [lit('AB')], index: 0 });
    expect(splitSourceSegmentAt([lit('AB')], 0, 2)).toEqual({ segments: [lit('AB')], index: 1 });
    expect(splitSourceSegmentAt([pill('X', INT)], 0, 1)).toBeNull();
  });

  it('setInsertedGlued toggles only inserted segments', () => {
    expect(setInsertedGlued([insWords('PAY')], 0, true)![0].glued).toBe(true);
    expect(setInsertedGlued([lit('A')], 0, true)).toBeNull();
  });
});

describe('normalizeSelection', () => {
  const segs = [lit('REF 12345 '), pill('HSBC', BANKS), exc(' XYZ ')];

  it('orders reversed selections and trims whitespace off the edges', () => {
    expect(normalizeSelection(segs, 0, 9, 0, 3)).toEqual({ index: 0, start: 4, end: 9, text: '12345' });
  });

  it('works on excluded segments too (Include / This part is…)', () => {
    expect(normalizeSelection(segs, 2, 0, 2, 5)).toEqual({ index: 2, start: 1, end: 4, text: 'XYZ' });
  });

  it('rejects cross-segment, pill, inserted, and blank selections', () => {
    expect(normalizeSelection(segs, 0, 8, 1, 2)).toBeNull();
    expect(normalizeSelection(segs, 1, 0, 1, 4)).toBeNull();
    expect(normalizeSelection([insWords('PAY')], 0, 0, 0, 3)).toBeNull();
    expect(normalizeSelection(segs, 0, 3, 0, 4)).toBeNull();
  });
});

// The §5 table, over 'REFERENCE 55074548 FM240305'.
describe('segmentsToTokens', () => {
  const t = (tokens: ReturnType<typeof segmentsToTokens>) =>
    tokens.map((x) => `${x.Glued ? '+' : ''}${x.Kind === 'Literal' ? x.Text : `<${x.Text}>`}`).join(' ');

  it('kept words + pills derive as before (glue from source whitespace)', () => {
    const segs = [lit('REFERENCE '), pill('55074548', INT), lit(' FM'), pill('240305', INT)];
    // FM240305: the second pill covers text glued to FM in the source.
    const glued = [lit('REFERENCE '), pill('55074548', INT), lit(' FM'), { ...pill('240305', INT) }];
    expect(t(segmentsToTokens('AI', glued))).toBe('REFERENCE <INT> FM +<INT>');
    expect(segmentsToTokens('AI', segs)[0]).toMatchObject({ Field: 'AI', Kind: 'Literal', Text: 'REFERENCE', Glued: false });
  });

  it('a trailing excluded run emits nothing — the key just ends there', () => {
    const segs = [lit('REFERENCE '), pill('55074548', INT), exc(' FM240305')];
    expect(t(segmentsToTokens('AI', segs))).toBe('REFERENCE <INT>');
  });

  it('a leading excluded run emits nothing — the key begins later', () => {
    const segs = [exc('REFERENCE '), pill('55074548', INT), lit(' FM')];
    expect(t(segmentsToTokens('AI', segs))).toBe('<INT> FM');
  });

  it('an excluded run BETWEEN two tokens emits one <ANY>, never glued', () => {
    const segs = [lit('REFERENCE '), exc('55074548'), lit(' FM'), pill('240305', INT)];
    expect(t(segmentsToTokens('AI', segs))).toBe('REFERENCE <ANY> FM +<INT>');
  });

  it('consecutive excluded segments count as ONE run', () => {
    const segs = [lit('A '), exc('B'), exc(' C'), lit(' D')];
    expect(t(segmentsToTokens('AI', segs))).toBe('A <ANY> D');
  });

  it('a whitespace-only excluded run is just a gap, not an <ANY>', () => {
    const segs = [lit('A'), exc('   '), lit('B')];
    expect(t(segmentsToTokens('AI', segs))).toBe('A B');
  });

  it('inserted words become a Literal with glue from their own flag', () => {
    const segs = [lit('REFERENCE '), insWords('PAY'), pill('55074548', INT)];
    expect(t(segmentsToTokens('AI', segs))).toBe('REFERENCE PAY <INT>');
    const gluedIns = [lit('REFERENCE'), insWords('PAY', true), pill('55074548', INT)];
    expect(t(segmentsToTokens('AI', gluedIns))).toBe('REFERENCE +PAY <INT>');
  });

  it('an inserted pill takes its glue flag; what follows an insertion is never glued', () => {
    const segs = [lit('FM'), insPill(INT, true), lit('X')];
    const tokens = segmentsToTokens('AI', segs);
    expect(tokens[1]).toMatchObject({ Kind: 'Placeholder', Text: 'INT', Glued: true });
    expect(tokens[2]).toMatchObject({ Text: 'X', Glued: false });
  });

  it('an excluded run before an insertion still yields the <ANY>', () => {
    const segs = [lit('A '), exc('B'), insWords('PAY')];
    expect(t(segmentsToTokens('AI', segs))).toBe('A <ANY> PAY');
  });

  it('carries a date-family FORMAT (Item) through spans and back out (formats delta)', () => {
    const spans: CurationSpan[] = [
      { Start: 0, Length: 6, Text: '240306', Token: { Field: 'TD', Kind: 'Placeholder', Text: 'DATE', Item: 'yyMMdd' } },
      { Start: 6, Length: 4, Text: '0306', Token: { Field: 'TD', Kind: 'Placeholder', Text: 'DATE', Item: 'MMdd', Glued: true } },
    ];
    const segs = segmentsFromSpans(spans);
    expect(segs[0].token).toMatchObject({ Text: 'DATE', Item: 'yyMMdd' });
    const tokens = segmentsToTokens('TD', segs);
    expect(tokens[0]).toMatchObject({ Kind: 'Placeholder', Text: 'DATE', Item: 'yyMMdd', Glued: false });
    expect(tokens[1]).toMatchObject({ Item: 'MMdd', Glued: true });
  });

  it('never marks the first token glued and carries Item/Length through', () => {
    const segs = [
      insPill({ Kind: 'List', Text: 'CARD_TYPES', Item: 'Visa' }, true),
      pill('AB', { Kind: 'Placeholder', Text: 'CHAR', Length: 2 }),
    ];
    const tokens = segmentsToTokens('AI', segs);
    expect(tokens[0]).toMatchObject({ Item: 'Visa', Glued: false });
    expect(tokens[1]).toMatchObject({ Length: 2, Glued: false });
  });
});

describe('segmentsHavePills', () => {
  it('reports pills, exclusions, and insertions as shaping', () => {
    expect(segmentsHavePills([lit('A')])).toBe(false);
    expect(segmentsHavePills([lit('A'), pill('B', INT)])).toBe(true);
    expect(segmentsHavePills([lit('A'), exc('B')])).toBe(true);
    expect(segmentsHavePills([lit('A'), insWords('B')])).toBe(true);
  });
});
