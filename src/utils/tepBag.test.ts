import { describe, it, expect } from 'vitest';
import { TEP_BAG_SEPARATOR, isTepBagText, parseTepBag, tepBagKeys } from './tepBag';

// Real shape from the INTERIM_TransactionsList feed (padding run inside the
// uniqueId value is intentional — gotcha #29 says values render verbatim).
const SAMPLE =
  'uniqueId: SD824475402-09-2026   2C [_TEP_] narrative.narr1: شركة مطاعم [_TEP_] narrative.narr2: 20260901SANCBKNCBK6B824 [_TEP_] narrative.narr3: BONU [_TEP_] partTrnType: CREDIT [_TEP_] prtclrsCode: 17IPS';

describe('isTepBagText', () => {
  it('detects the separator and rejects everything else', () => {
    expect(isTepBagText(SAMPLE)).toBe(true);
    expect(isTepBagText('plain narrative text')).toBe(false);
    expect(isTepBagText(null)).toBe(false);
    expect(isTepBagText(42)).toBe(false);
  });
});

describe('parseTepBag', () => {
  it('returns [] for non-bag text', () => {
    expect(parseTepBag('ORD//JOHN DOE')).toEqual([]);
  });

  it('splits the sample into keyed entries in order', () => {
    const entries = parseTepBag(SAMPLE);
    expect(entries.map((e) => e.key)).toEqual([
      'uniqueId', 'narrative.narr1', 'narrative.narr2', 'narrative.narr3', 'partTrnType', 'prtclrsCode',
    ]);
    expect(entries.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps internal padding runs while stripping only the join spaces', () => {
    const [first] = parseTepBag(SAMPLE);
    expect(first.text).toBe('uniqueId: SD824475402-09-2026   2C');
    expect(first.value).toBe('SD824475402-09-2026   2C');
  });

  it('indices match a plain split on the separator (Split & Pick contract)', () => {
    const parts = SAMPLE.split(TEP_BAG_SEPARATOR);
    for (const entry of parseTepBag(SAMPLE)) {
      expect(parts[entry.index].trim()).toBe(entry.text.trim());
    }
  });

  it('offsets slice the original string exactly', () => {
    for (const entry of parseTepBag(SAMPLE)) {
      expect(SAMPLE.slice(entry.start, entry.end)).toBe(entry.text);
      expect(SAMPLE.slice(entry.valueStart, entry.end)).toBe(entry.value);
    }
  });

  it('tolerates parts without a key shape', () => {
    const entries = parseTepBag('free text part [_TEP_] key1: v1');
    expect(entries[0].key).toBeNull();
    expect(entries[0].value).toBe('free text part');
    expect(entries[1]).toMatchObject({ key: 'key1', value: 'v1', index: 1 });
  });

  it('a key with an empty value still parses', () => {
    const entries = parseTepBag('a: [_TEP_] b: x');
    expect(entries[0]).toMatchObject({ key: 'a', value: '' });
  });
});

describe('tepBagKeys', () => {
  it('unions keys across rows in first-seen order, skipping non-bag rows', () => {
    const rows = [
      { AdditionalInformation: 'plain narrative' },
      { AdditionalInformation: 'uniqueId: X [_TEP_] partTrnType: CREDIT' },
      { AdditionalInformation: 'uniqueId: Y [_TEP_] prtclrsCode: 17IPS' },
    ];
    expect(tepBagKeys(rows)).toEqual(['uniqueId', 'partTrnType', 'prtclrsCode']);
  });

  it('returns [] when no row carries a bag', () => {
    expect(tepBagKeys([{ AdditionalInformation: 'ORD//X' }])).toEqual([]);
    expect(tepBagKeys(undefined)).toEqual([]);
    expect(tepBagKeys([])).toEqual([]);
  });

  it('reads a custom field name', () => {
    const rows = [{ TransactionDetails: 'k1: a [_TEP_] k2: b' }];
    expect(tepBagKeys(rows, 'TransactionDetails')).toEqual(['k1', 'k2']);
  });
});
